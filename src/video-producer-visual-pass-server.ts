import "server-only";
import type { ServiceClient } from "./video-producer-server";

const ACTIVE_IMPORT_STATUSES = new Set(["queued", "downloading", "normalizing", "uploading"]);
const ACTIVE_GENERATION_STATUSES = new Set(["queued", "generating", "succeeded", "importing"]);
const LONG_FORM_BROLL_FLOOR_SECONDS = 120;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export type VideoProducerVisualPassReadiness = {
  analyzed: boolean;
  ready: boolean;
  beatCount: number;
  brollCount: number;
  placementCount: number;
  unresolvedBrollCount: number;
  activeImportCount: number;
  activeGenerationCount: number;
  missingRequiredBroll: boolean;
  analyzedAt: string | null;
};

export async function resolveVideoProducerVisualPassReadiness(
  service: ServiceClient,
  projectId: string
): Promise<VideoProducerVisualPassReadiness> {
  const [projectResult, beatsResult, placementsResult, importsResult, generationResult] = await Promise.all([
    service.from("video_producer_projects")
      .select("id,mode,source_duration,director_metadata")
      .eq("id", projectId)
      .is("deleted_at", null)
      .maybeSingle(),
    service.from("video_producer_visual_beats")
      .select("id,recommendation,status")
      .eq("project_id", projectId),
    service.from("video_producer_visual_placements")
      .select("id,beat_id")
      .eq("project_id", projectId)
      .eq("active", true),
    service.from("video_producer_visual_import_jobs")
      .select("id,beat_id,status")
      .eq("project_id", projectId)
      .in("status", [...ACTIVE_IMPORT_STATUSES]),
    service.from("video_producer_visual_generation_jobs")
      .select("id,beat_id,status")
      .eq("project_id", projectId)
      .in("status", [...ACTIVE_GENERATION_STATUSES])
  ]);

  for (const result of [projectResult, beatsResult, placementsResult, importsResult, generationResult]) {
    if (result.error) throw new Error(result.error.message);
  }
  if (!projectResult.data) throw new Error("Video Producer project not found.");

  const metadata = record(projectResult.data.director_metadata);
  const visualPass = record(metadata.visualPass);
  const analyzedAt = typeof visualPass.analyzedAt === "string" ? visualPass.analyzedAt : null;
  const beats = beatsResult.data ?? [];
  const placements = placementsResult.data ?? [];
  const activeImports = importsResult.data ?? [];
  const activeGeneration = generationResult.data ?? [];
  const placedBeatIds = new Set(placements.map((item) => item.beat_id));
  const importingBeatIds = new Set(activeImports.map((item) => item.beat_id));
  const generatingBeatIds = new Set(activeGeneration.map((item) => item.beat_id));
  const broll = beats.filter((beat) => beat.recommendation === "b-roll");
  const unresolved = broll.filter((beat) =>
    beat.status !== "skipped" &&
    !placedBeatIds.has(beat.id) &&
    !importingBeatIds.has(beat.id) &&
    !generatingBeatIds.has(beat.id)
  );

  const analyzed = Boolean(analyzedAt) || beats.length > 0;
  const sourceDuration = Number(projectResult.data.source_duration ?? 0);
  const requiresBroll = projectResult.data.mode === "podcast" && Number.isFinite(sourceDuration) && sourceDuration >= LONG_FORM_BROLL_FLOOR_SECONDS;
  const missingRequiredBroll = analyzed && requiresBroll && broll.length === 0;
  const ready = analyzed && !missingRequiredBroll && activeImports.length === 0 && activeGeneration.length === 0 && unresolved.length === 0;

  return {
    analyzed,
    ready,
    beatCount: beats.length,
    brollCount: broll.length,
    placementCount: placements.length,
    unresolvedBrollCount: unresolved.length,
    activeImportCount: activeImports.length,
    activeGenerationCount: activeGeneration.length,
    missingRequiredBroll,
    analyzedAt
  };
}

export async function requireVideoProducerVisualPassReady(service: ServiceClient, projectId: string) {
  const state = await resolveVideoProducerVisualPassReadiness(service, projectId);
  if (!state.analyzed) {
    throw new Error("Run Visual Pass before approval. A production cannot silently skip the visual edit.");
  }
  if (state.missingRequiredBroll) {
    throw new Error("Visual Pass returned zero B-roll for a long-form episode. Re-analyze the episode before approval so real footage is part of the edit.");
  }
  if (state.activeImportCount || state.activeGenerationCount) {
    throw new Error("Visual Pass media is still preparing. Wait for the selected footage to finish importing before approval.");
  }
  if (state.unresolvedBrollCount) {
    throw new Error(`${state.unresolvedBrollCount} B-roll beat${state.unresolvedBrollCount === 1 ? " is" : "s are"} still unresolved. Select footage, generate an insert, or explicitly stay on A-roll.`);
  }
  return state;
}
