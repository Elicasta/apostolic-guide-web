import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { pathwayBySlug } from "@/pathway-catalog";
import { createServiceClient } from "@/supabase";
import {
  createPrivateBlobDownloadUrl,
  createWorkerCallbackToken,
  dispatchVideoProducerWorker,
  videoProducerRendererCredentials,
  videoProducerWorkerRef
} from "@/video-producer-server";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({ projectId: z.string().uuid() });

export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid Publisher handoff request." }, { status: 400 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });

  const projectResult = await service.from("video_producer_projects")
    .select("id,title,mode,status,pathway_slug,publisher_render_id")
    .eq("id", parsed.data.projectId).maybeSingle();
  if (projectResult.error) return NextResponse.json({ error: projectResult.error.message }, { status: 500 });
  const project = projectResult.data;
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  if (!project.pathway_slug || !pathwayBySlug(project.pathway_slug)) return NextResponse.json({ error: "Choose the pathway before sending this project to Publisher." }, { status: 409 });
  if (!['review', 'completed'].includes(project.status)) return NextResponse.json({ error: "The review master must be complete before sending it to Publisher." }, { status: 409 });

  if (project.publisher_render_id) {
    const existing = await service.from("pathway_video_renders").select("id,status,output_url,error").eq("id", project.publisher_render_id).maybeSingle();
    if (existing.data && existing.data.status !== "failed") {
      return NextResponse.json({ ok: true, existing: true, render: existing.data, publisherUrl: `/admin/publish?slug=${encodeURIComponent(project.pathway_slug)}` });
    }
  }

  const latestRender = await service.from("video_producer_renders")
    .select("id,output_storage_path,completed_at")
    .eq("project_id", project.id).eq("status", "completed")
    .order("completed_at", { ascending: false }).limit(1).maybeSingle();
  if (latestRender.error) return NextResponse.json({ error: latestRender.error.message }, { status: 500 });
  if (!latestRender.data?.output_storage_path) return NextResponse.json({ error: "Completed review master was not found." }, { status: 409 });

  const format = project.mode === "reels" ? "vertical" : "youtube";
  const assetType = project.mode === "reels" ? "short_video" : "youtube";
  const platform = project.mode === "reels" ? "vertical_social" : "youtube";
  const suffix = project.mode === "reels" ? "vertical" : "youtube";
  const assetId = randomUUID();
  const renderId = randomUUID();
  const storagePath = `pathways/${project.pathway_slug}/video-producer/${renderId}-${suffix}.mp4`;
  const publicUrl = service.storage.from("pathway-video").getPublicUrl(storagePath).data.publicUrl;
  const signedUpload = await service.storage.from("pathway-video").createSignedUploadUrl(storagePath, { upsert: false });
  if (signedUpload.error || !signedUpload.data?.signedUrl) return NextResponse.json({ error: signedUpload.error?.message || "Publisher storage upload could not be prepared." }, { status: 500 });
  const sourceUrl = await createPrivateBlobDownloadUrl(latestRender.data.output_storage_path, 3 * 60 * 60 * 1000);
  const callback = createWorkerCallbackToken();
  const now = new Date().toISOString();

  const asset = await service.from("pathway_assets").insert({
    id: assetId,
    pathway_slug: project.pathway_slug,
    type: assetType,
    title: project.title,
    status: "in_production",
    platform,
    source_url: null,
    file_url: null,
    notes: `Video Producer handoff from project ${project.id}. Private review master remains in Video Producer.`,
    created_by: access.user.id,
    updated_by: access.user.id
  }).select("id").single();
  if (asset.error) return NextResponse.json({ error: asset.error.message }, { status: 500 });

  const workerRef = videoProducerWorkerRef();
  const render = await service.from("pathway_video_renders").insert({
    id: renderId,
    pathway_slug: project.pathway_slug,
    project_id: null,
    asset_id: assetId,
    format,
    status: "queued",
    config_snapshot: {
      source: "video_producer",
      videoProducerProjectId: project.id,
      videoProducerRenderId: latestRender.data.id,
      workerRef,
      publisherBridge: { callbackTokenHash: callback.hash, storagePath, publicUrl }
    },
    storage_path: storagePath,
    requested_by: access.user.id,
    requested_at: now
  }).select("*").single();
  if (render.error) {
    await service.from("pathway_assets").delete().eq("id", assetId);
    return NextResponse.json({ error: render.error.message }, { status: 500 });
  }

  try {
    const { token, repository } = await videoProducerRendererCredentials(service);
    if (!token) throw new Error("Video worker is not connected.");
    await dispatchVideoProducerWorker({
      token,
      repository,
      eventType: "video-producer-publisher-handoff",
      payload: {
        job_id: renderId,
        project_id: project.id,
        worker_ref: workerRef,
        source_url: sourceUrl,
        upload_url: signedUpload.data.signedUrl,
        callback_url: `${new URL(request.url).origin}/api/admin/video-producer/send-to-publisher/callback`,
        callback_token: callback.token
      }
    });
    await service.from("pathway_video_renders").update({ status: "rendering", started_at: new Date().toISOString() }).eq("id", renderId);
    await service.from("video_producer_projects").update({ publisher_render_id: renderId, updated_by: access.user.id }).eq("id", project.id);
    return NextResponse.json({ ok: true, renderId, status: "rendering", publisherUrl: `/admin/publish?slug=${encodeURIComponent(project.pathway_slug)}` });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Publisher handoff failed.";
    await service.from("pathway_video_renders").update({ status: "failed", error: message, completed_at: new Date().toISOString() }).eq("id", renderId);
    await service.from("pathway_assets").update({ status: "blocked", notes: `Video Producer Publisher handoff failed: ${message}` }).eq("id", assetId);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
