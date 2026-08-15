import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { allPathways, pathwayBySlug } from "@/pathway-catalog";
import { createPrivateBlobDownloadUrl } from "@/video-producer-server";
import { createServiceClient } from "@/supabase";
import type { VideoProducerEditPlan } from "@/video-producer";

export const runtime = "nodejs";

const patchSchema = z.object({
  projectId: z.string().uuid(),
  pathwaySlug: z.string().nullable().optional(),
  musicTrackId: z.string().uuid().nullable().optional(),
  audioPreset: z.enum(["ag-voice-clean", "ag-voice-punch", "none"]).optional(),
  colorPreset: z.enum(["ag-studio", "ag-warm", "ag-clean", "none"]).optional()
});

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export async function GET(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const projectId = new URL(request.url).searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId is required." }, { status: 400 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });

  const [projectResult, tracksResult, thumbsResult, renderResult] = await Promise.all([
    service.from("video_producer_projects")
      .select("id,title,mode,status,parent_project_id,pathway_slug,selected_music_track_id,publisher_render_id,source_duration,edit_plan,approval_fingerprint")
      .eq("id", projectId).maybeSingle(),
    service.from("video_producer_music_tracks")
      .select("id,title,source_provider,source_url,storage_locator,filename,content_type,size_bytes,duration_seconds,bpm,mood,tags,rights_note,active,updated_at")
      .eq("active", true).order("updated_at", { ascending: false }).limit(100),
    service.from("video_producer_thumbnails")
      .select("id,project_id,variant,headline,timestamp_seconds,status,storage_locator,error,created_at,completed_at")
      .eq("project_id", projectId).order("variant"),
    service.from("video_producer_renders")
      .select("id,status,output_storage_path,completed_at")
      .eq("project_id", projectId).eq("status", "completed")
      .order("completed_at", { ascending: false }).limit(1).maybeSingle()
  ]);
  if (projectResult.error) return NextResponse.json({ error: projectResult.error.message }, { status: 500 });
  if (tracksResult.error) return NextResponse.json({ error: tracksResult.error.message }, { status: 500 });
  if (thumbsResult.error) return NextResponse.json({ error: thumbsResult.error.message }, { status: 500 });
  if (renderResult.error) return NextResponse.json({ error: renderResult.error.message }, { status: 500 });
  const project = projectResult.data;
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const [thumbnails, musicTracks, publisherResult] = await Promise.all([
    Promise.all((thumbsResult.data ?? []).map(async (thumb) => ({
      ...thumb,
      previewUrl: thumb.status === "completed" && thumb.storage_locator
        ? await createPrivateBlobDownloadUrl(thumb.storage_locator, 60 * 60 * 1000)
        : null
    }))),
    Promise.all((tracksResult.data ?? []).map(async (track) => ({
      ...track,
      storage_locator: undefined,
      previewUrl: track.storage_locator ? await createPrivateBlobDownloadUrl(track.storage_locator, 60 * 60 * 1000) : null
    }))),
    project.publisher_render_id
      ? service.from("pathway_video_renders").select("id,status,output_url,error,asset_id,completed_at").eq("id", project.publisher_render_id).maybeSingle()
      : Promise.resolve({ data: null, error: null })
  ]);
  if (publisherResult.error) return NextResponse.json({ error: publisherResult.error.message }, { status: 500 });

  return NextResponse.json({
    project,
    latestCompletedRender: renderResult.data ?? null,
    publisherRender: publisherResult.data ?? null,
    publisherUrl: project.pathway_slug ? `/admin/publish?slug=${encodeURIComponent(project.pathway_slug)}` : "/admin/publish",
    pathways: allPathways.map((pathway) => ({
      slug: pathway.slug,
      title: pathway.title,
      summary: pathway.summary,
      steps: pathway.steps.map((step) => ({ title: step.title, reference: step.reference }))
    })),
    musicTracks,
    thumbnails
  });
}

export async function PATCH(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid finishing request." }, { status: 400 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });

  const result = await service.from("video_producer_projects")
    .select("id,mode,status,parent_project_id,source_duration,transcript_text,edit_plan,pathway_slug,selected_music_track_id")
    .eq("id", parsed.data.projectId).maybeSingle();
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
  const project = result.data;
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  if (["uploading", "transcribing", "directing", "rendering"].includes(project.status)) {
    return NextResponse.json({ error: "Wait for the current production job to finish before changing finishing settings." }, { status: 409 });
  }

  const updates: Record<string, unknown> = { updated_by: access.user.id };
  let invalidateApproval = false;
  let pathwayChanged = false;
  let nextPlan = isObject(project.edit_plan) ? { ...(project.edit_plan as VideoProducerEditPlan) } : null;
  let planChanged = false;

  if (parsed.data.pathwaySlug !== undefined) {
    const pathway = parsed.data.pathwaySlug ? pathwayBySlug(parsed.data.pathwaySlug) : null;
    if (parsed.data.pathwaySlug && !pathway) return NextResponse.json({ error: "Unknown pathway." }, { status: 400 });
    const nextPathway = pathway?.slug ?? null;
    updates.pathway_slug = nextPathway;
    pathwayChanged = (project.pathway_slug ?? null) !== nextPathway;
    invalidateApproval = pathwayChanged;
    if (pathwayChanged && project.edit_plan) {
      // The Director uses pathway context for pathway-stop structure and references.
      // A different pathway therefore invalidates the semantic plan, not just approval.
      updates.edit_plan = null;
      updates.status = project.transcript_text ? "uploaded" : project.status;
      nextPlan = null;
    }
  }

  if (parsed.data.musicTrackId !== undefined) {
    if (parsed.data.musicTrackId) {
      const trackResult = await service.from("video_producer_music_tracks").select("id,active").eq("id", parsed.data.musicTrackId).maybeSingle();
      if (trackResult.error) return NextResponse.json({ error: trackResult.error.message }, { status: 500 });
      if (!trackResult.data?.active) return NextResponse.json({ error: "Music track is unavailable." }, { status: 409 });
    }
    updates.selected_music_track_id = parsed.data.musicTrackId ?? null;
    if ((project.selected_music_track_id ?? null) !== (parsed.data.musicTrackId ?? null)) {
      invalidateApproval = true;
      if (nextPlan) {
        nextPlan.music = parsed.data.musicTrackId ? [{
          id: "ag-music-bed",
          trackId: parsed.data.musicTrackId,
          start: 0,
          end: Number(project.source_duration || nextPlan.sourceDuration || 0),
          gainDb: project.mode === "reels" ? -24 : -28,
          duckUnderVoice: true
        }] : [];
        planChanged = true;
      }
    }
  }

  if (parsed.data.audioPreset !== undefined && nextPlan && nextPlan.audioPreset !== parsed.data.audioPreset) {
    nextPlan.audioPreset = parsed.data.audioPreset;
    planChanged = true;
    invalidateApproval = true;
  }

  if (parsed.data.colorPreset !== undefined && nextPlan && nextPlan.colorPreset !== parsed.data.colorPreset) {
    nextPlan.colorPreset = parsed.data.colorPreset;
    planChanged = true;
    invalidateApproval = true;
  }

  if (planChanged && nextPlan) updates.edit_plan = nextPlan;

  if (invalidateApproval) {
    updates.approval_fingerprint = null;
    updates.approved_at = null;
    if (project.edit_plan && !pathwayChanged) updates.status = "planned";
  }

  const saved = await service.from("video_producer_projects").update(updates).eq("id", project.id).select("*").single();
  if (saved.error) return NextResponse.json({ error: saved.error.message }, { status: 500 });

  if (!project.parent_project_id && parsed.data.pathwaySlug !== undefined) {
    await service.from("video_producer_projects")
      .update({ pathway_slug: parsed.data.pathwaySlug ?? null, updated_by: access.user.id })
      .eq("parent_project_id", project.id);
  }

  return NextResponse.json({ project: saved.data });
}
