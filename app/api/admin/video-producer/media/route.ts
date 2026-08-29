import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";
import { createPrivateBlobDownloadUrl } from "@/video-producer-server";
import { defaultVideoProducerAudioPlan, type VideoProducerAudioPlan } from "@/video-producer-multicam";

export const runtime = "nodejs";

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("offset"), projectId: z.string().uuid(), assetId: z.string().uuid(), offsetSeconds: z.number().finite().min(-86400).max(86400) }),
  z.object({ action: z.literal("audio"), projectId: z.string().uuid(), source: z.enum(["camera_a", "external_audio"]), assetId: z.string().uuid().optional() })
]);

async function rootProjectId(service: NonNullable<ReturnType<typeof createServiceClient>>, projectId: string) {
  const project = await service.from("video_producer_projects").select("id,parent_project_id").eq("id", projectId).is("deleted_at", null).maybeSingle();
  if (project.error) throw new Error(project.error.message);
  if (!project.data) throw new Error("Video Producer project not found.");
  return project.data.parent_project_id || project.data.id;
}

export async function GET(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const projectId = new URL(request.url).searchParams.get("projectId") || "";
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) return NextResponse.json({ error: "Invalid project id." }, { status: 400 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });
  try {
    const rootId = await rootProjectId(service, projectId);
    const [projectResult, assetsResult] = await Promise.all([
      service.from("video_producer_projects").select("id,parent_project_id,camera_plan,audio_plan,media_revision,source_range_start,source_range_end").eq("id", projectId).maybeSingle(),
      service.from("video_producer_media_assets").select("*").eq("project_id", rootId).eq("active", true).order("role")
    ]);
    if (projectResult.error) throw new Error(projectResult.error.message);
    if (assetsResult.error) throw new Error(assetsResult.error.message);
    const assets = await Promise.all((assetsResult.data ?? []).map(async (asset) => {
      let previewUrl: string | null = null;
      try { previewUrl = await createPrivateBlobDownloadUrl(asset.storage_locator, 30 * 60 * 1000); }
      catch { previewUrl = null; }
      return { ...asset, previewUrl };
    }));
    return NextResponse.json({ project: projectResult.data, rootProjectId: rootId, assets });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Multicam media could not be loaded." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid media update." }, { status: 400 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });

  try {
    if (parsed.data.action === "offset") {
      const rootId = await rootProjectId(service, parsed.data.projectId);
      const asset = await service.from("video_producer_media_assets").select("id,project_id,active,revision").eq("id", parsed.data.assetId).eq("project_id", rootId).eq("active", true).maybeSingle();
      if (asset.error) throw new Error(asset.error.message);
      if (!asset.data) return NextResponse.json({ error: "Synchronized asset not found." }, { status: 404 });
      const revision = Number(asset.data.revision || 1) + 1;
      const updated = await service.from("video_producer_media_assets").update({
        offset_seconds: parsed.data.offsetSeconds,
        sync_status: "manual",
        sync_method: "manual",
        sync_confidence: 1,
        revision,
        sync_metadata: { manuallyAdjustedAt: new Date().toISOString() },
        updated_by: access.user.id
      }).eq("id", asset.data.id).select("*").single();
      if (updated.error) throw new Error(updated.error.message);
      const invalidated = await service.from("video_producer_projects").update({
        camera_plan: null,
        approval_fingerprint: null,
        approved_at: null,
        updated_by: access.user.id
      }).or(`id.eq.${rootId},parent_project_id.eq.${rootId}`).is("deleted_at", null);
      if (invalidated.error) throw new Error(invalidated.error.message);
      return NextResponse.json({ asset: updated.data });
    }

    let audioPlan: VideoProducerAudioPlan = defaultVideoProducerAudioPlan();
    if (parsed.data.source === "external_audio") {
      if (!parsed.data.assetId) return NextResponse.json({ error: "Choose a synchronized external audio asset." }, { status: 400 });
      const rootId = await rootProjectId(service, parsed.data.projectId);
      const asset = await service.from("video_producer_media_assets")
        .select("id,role,active,sync_status,offset_seconds,revision")
        .eq("id", parsed.data.assetId).eq("project_id", rootId).eq("role", "external_audio").eq("active", true).maybeSingle();
      if (asset.error) throw new Error(asset.error.message);
      if (!asset.data || !["synced", "manual"].includes(asset.data.sync_status) || asset.data.offset_seconds == null) {
        return NextResponse.json({ error: "External Audio must be synchronized before it can become master audio." }, { status: 409 });
      }
      audioPlan = { version: 1, source: "external_audio", assetId: asset.data.id, offsetSeconds: Number(asset.data.offset_seconds), syncRevision: Number(asset.data.revision || 1) };
    }
    const project = await service.from("video_producer_projects").update({
      audio_plan: audioPlan,
      approval_fingerprint: null,
      approved_at: null,
      updated_by: access.user.id
    }).eq("id", parsed.data.projectId).is("deleted_at", null).select("*").single();
    if (project.error) throw new Error(project.error.message);
    return NextResponse.json({ project: project.data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Multicam media could not be updated." }, { status: 500 });
  }
}
