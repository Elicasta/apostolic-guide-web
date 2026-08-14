import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";
import { compileVideoProducerRenderPlan, type VideoProducerEditPlan } from "@/video-producer";
import { normalizeVideoProducerTranscript, sliceVideoProducerTranscript } from "@/video-producer-ai";
import {
  createPrivateBlobDownloadUrl,
  createPrivateBlobUploadUrl,
  createWorkerCallbackToken,
  deletePrivateVideoProducerBlob,
  dispatchVideoProducerWorker,
  storeVideoProducerManifest,
  videoProducerPlanFingerprint,
  videoProducerRendererCredentials
} from "@/video-producer-server";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({ projectId: z.string().uuid() });
const MAX_RENDER_BYTES = 20 * 1024 * 1024 * 1024;

export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid render request." }, { status: 400 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });

  const result = await service.from("video_producer_projects")
    .select("id,title,mode,status,source_provider,source_locator,source_filename,source_duration,source_range_start,source_range_end,transcript,edit_plan,approval_fingerprint,approved_at")
    .eq("id", parsed.data.projectId)
    .maybeSingle();
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
  const project = result.data;
  if (!project?.source_locator || !project.edit_plan) return NextResponse.json({ error: "Source and edit plan are required before rendering." }, { status: 409 });
  if (project.status !== "approved" || !project.approval_fingerprint) return NextResponse.json({ error: "Approve the current edit before rendering." }, { status: 409 });
  if (project.source_provider !== "vercel_blob") return NextResponse.json({ error: "This source provider is not renderable yet." }, { status: 409 });

  const plan = project.edit_plan as VideoProducerEditPlan;
  const currentFingerprint = videoProducerPlanFingerprint(plan);
  if (currentFingerprint !== project.approval_fingerprint) return NextResponse.json({ error: "The edit changed after approval. Review and approve it again." }, { status: 409 });
  let renderPlan;
  try {
    renderPlan = compileVideoProducerRenderPlan(plan);
    if (renderPlan.outputDuration <= 0 || !renderPlan.keepSegments.length) throw new Error("Edit plan has no renderable media.");
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Edit plan could not be compiled." }, { status: 422 });
  }

  const fullTranscript = normalizeVideoProducerTranscript(project.transcript);
  const localTranscript = project.source_range_start != null && project.source_range_end != null
    ? sliceVideoProducerTranscript(fullTranscript, Number(project.source_range_start), Number(project.source_range_end))
    : fullTranscript;
  if (renderPlan.captions.enabled && !localTranscript.words.length) return NextResponse.json({ error: "Captioned renders require word-level transcript timing." }, { status: 409 });

  let githubToken = "";
  let repository = "";
  try { ({ token: githubToken, repository } = await videoProducerRendererCredentials(service)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Worker credentials could not be loaded." }, { status: 500 }); }
  if (!githubToken) return NextResponse.json({ error: "Video worker is not connected." }, { status: 503 });

  const renderId = randomUUID();
  const manifestPath = `video-producer/manifests/${project.id}/${renderId}.json`;
  const outputPath = `video-producer/renders/${project.id}/${renderId}.mp4`;
  const callback = createWorkerCallbackToken();
  const sourceRange = project.source_range_start != null && project.source_range_end != null
    ? { start: Number(project.source_range_start), end: Number(project.source_range_end) }
    : null;
  const manifest = {
    version: 1,
    project: { id: project.id, title: project.title, mode: project.mode },
    source: { filename: project.source_filename, duration: project.source_duration, range: sourceRange },
    renderPlan,
    transcript: localTranscript,
    brand: {
      logo: "public/brand/apostolic-guide-mark-reversed.png",
      wordmark: "public/brand/apostolic-guide-wordmark-reversed.png"
    }
  };

  let uploadedManifestPath: string | null = null;
  try {
    const sourceUrl = await createPrivateBlobDownloadUrl(project.source_locator, 8 * 60 * 60 * 1000);
    const outputUploadUrl = await createPrivateBlobUploadUrl({
      pathname: outputPath,
      contentType: "video/mp4",
      maxBytes: MAX_RENDER_BYTES,
      ttlMs: 8 * 60 * 60 * 1000
    });
    const manifestBlob = await storeVideoProducerManifest(manifestPath, manifest);
    uploadedManifestPath = manifestBlob.pathname;
    const manifestUrl = await createPrivateBlobDownloadUrl(manifestBlob.pathname, 8 * 60 * 60 * 1000);
    const snapshot = {
      version: 1,
      approvalFingerprint: currentFingerprint,
      mode: project.mode,
      output: renderPlan.output,
      sourceRange,
      rendererBridge: { callbackTokenHash: callback.hash, manifestPath: manifestBlob.pathname, outputPath }
    };
    const created = await service.from("video_producer_renders").insert({
      id: renderId,
      project_id: project.id,
      status: "queued",
      manifest_storage_path: manifestBlob.pathname,
      config_snapshot: snapshot,
      progress: { percent: 0, stage: "Queued", heartbeatAt: new Date().toISOString() },
      requested_by: access.user.id
    }).select("*").single();
    if (created.error) throw new Error(created.error.message);

    await dispatchVideoProducerWorker({
      token: githubToken,
      repository,
      eventType: "video-producer-render",
      payload: {
        job_id: renderId,
        project_id: project.id,
        source_url: sourceUrl,
        manifest_url: manifestUrl,
        output_upload_url: outputUploadUrl,
        callback_url: `${new URL(request.url).origin}/api/admin/video-producer/render-callback`,
        callback_token: callback.token
      }
    });
    uploadedManifestPath = null;
    const projectUpdate = await service.from("video_producer_projects").update({ status: "rendering", updated_by: access.user.id }).eq("id", project.id);
    if (projectUpdate.error) console.error("Video Producer project status update failed after render dispatch", projectUpdate.error.message);
    return NextResponse.json({ render: created.data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Render could not be queued.";
    if (uploadedManifestPath) await deletePrivateVideoProducerBlob(uploadedManifestPath);
    await service.from("video_producer_renders").update({ status: "failed", error: message, completed_at: new Date().toISOString() }).eq("id", renderId);
    return NextResponse.json({ error: message, code: message.toLowerCase().includes("blob") ? "blob_not_connected" : "render_dispatch_failed" }, { status: 502 });
  }
}
