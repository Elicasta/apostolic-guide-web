import "server-only";
import type { createServiceClient } from "./supabase";
import { buildKeepSegments, type VideoProducerEditPlan } from "./video-producer";
import {
  compileCameraRangesThroughContentCuts,
  defaultVideoProducerAudioPlan,
  mediaLocalCoverage,
  normalizeVideoProducerCameraPlan,
  videoProducerProductionFingerprintInput,
  type VideoProducerAudioPlan,
  type VideoProducerCameraPlan,
  type VideoProducerMediaAsset
} from "./video-producer-multicam";
import { videoProducerPlanFingerprint } from "./video-producer-server";

type ServiceClient = NonNullable<ReturnType<typeof createServiceClient>>;

export type VideoProducerProductionProject = {
  id: string;
  parent_project_id?: string | null;
  mode: "podcast" | "reels";
  source_duration?: number | null;
  source_range_start?: number | null;
  source_range_end?: number | null;
  edit_plan: VideoProducerEditPlan;
  camera_plan?: VideoProducerCameraPlan | null;
  audio_plan?: VideoProducerAudioPlan | null;
};

export type VideoProducerResolvedProduction = {
  rootProjectId: string;
  media: VideoProducerMediaAsset[];
  cameraB: VideoProducerMediaAsset | null;
  externalAudio: VideoProducerMediaAsset | null;
  cameraBCoverage: { start: number; end: number } | null;
  cameraPlan: VideoProducerCameraPlan | null;
  audioPlan: VideoProducerAudioPlan;
  cameraRanges: ReturnType<typeof compileCameraRangesThroughContentCuts>;
  fingerprint: string;
  usesMulticam: boolean;
};

function rangeCovered(start: number, end: number, coverage: { start: number; end: number }) {
  return start >= coverage.start - 0.03 && end <= coverage.end + 0.03;
}

export async function resolveVideoProducerProductionState(service: ServiceClient, project: VideoProducerProductionProject): Promise<VideoProducerResolvedProduction> {
  const rootProjectId = project.parent_project_id || project.id;
  const assetsResult = await service.from("video_producer_media_assets")
    .select("id,project_id,role,storage_provider,storage_locator,filename,mime_type,size_bytes,duration,has_audio,sync_status,sync_method,offset_seconds,sync_confidence,sync_metadata,revision,active")
    .eq("project_id", rootProjectId).eq("active", true);
  if (assetsResult.error) throw new Error(assetsResult.error.message);
  const media = (assetsResult.data ?? []) as VideoProducerMediaAsset[];
  const cameraB = media.find((asset) => asset.role === "camera_b") ?? null;
  const externalAudio = media.find((asset) => asset.role === "external_audio") ?? null;
  const duration = project.source_range_start != null && project.source_range_end != null
    ? Number(project.source_range_end) - Number(project.source_range_start)
    : Number(project.source_duration || project.edit_plan.sourceDuration || 0);
  if (duration <= 0) throw new Error("Project duration is not available for production fingerprinting.");

  const cameraBReady = Boolean(cameraB && ["synced", "manual"].includes(cameraB.sync_status) && cameraB.duration != null && cameraB.offset_seconds != null);
  const cameraBCoverage = cameraBReady && cameraB
    ? mediaLocalCoverage(Number(cameraB.duration), Number(cameraB.offset_seconds), Number(project.source_range_start || 0), project.source_range_end != null ? Number(project.source_range_end) : null)
    : null;
  if (project.camera_plan && cameraBReady && cameraB && project.camera_plan.sourceRevision != null && Number(project.camera_plan.sourceRevision) !== Number(cameraB.revision || 1)) {
    throw new Error("Camera B synchronization changed after Smart Auto Cut. Regenerate or save the Camera Plan before approval.");
  }
  const rawCameraPlan = project.camera_plan && cameraBReady && cameraBCoverage
    ? normalizeVideoProducerCameraPlan(project.camera_plan, duration, cameraBCoverage)
    : null;
  const cameraPlan = rawCameraPlan?.decisions.some((decision) => decision.camera === "B") ? rawCameraPlan : null;

  const requestedAudio = project.audio_plan?.version === 1 ? project.audio_plan : defaultVideoProducerAudioPlan();
  let audioPlan: VideoProducerAudioPlan = defaultVideoProducerAudioPlan();
  if (requestedAudio.source === "external_audio") {
    if (!externalAudio || externalAudio.id !== requestedAudio.assetId || !["synced", "manual"].includes(externalAudio.sync_status) || externalAudio.offset_seconds == null || externalAudio.duration == null) {
      throw new Error("The selected External Audio is no longer synchronized. Choose Camera A audio or synchronize the recorder again.");
    }
    if (Number(externalAudio.revision || 1) !== Number(requestedAudio.syncRevision || 0)) {
      throw new Error("External Audio synchronization changed after it was selected. Re-select the master audio before approval.");
    }
    const coverage = mediaLocalCoverage(Number(externalAudio.duration), Number(externalAudio.offset_seconds), Number(project.source_range_start || 0), project.source_range_end != null ? Number(project.source_range_end) : null);
    const keepSegments = buildKeepSegments(project.edit_plan.cuts, duration);
    if (!coverage || keepSegments.some((segment) => !rangeCovered(segment.start, segment.end, coverage))) {
      throw new Error("External Audio does not cover every kept part of this edit. Correct the sync/recording range or use Camera A audio.");
    }
    audioPlan = { ...requestedAudio, offsetSeconds: Number(externalAudio.offset_seconds) };
  }

  const usedMedia = media.filter((asset) => (cameraPlan && asset.role === "camera_b") || (audioPlan.source === "external_audio" && asset.role === "external_audio"));
  const cameraRanges = cameraPlan ? compileCameraRangesThroughContentCuts(cameraPlan, project.edit_plan.cuts, duration, cameraBCoverage) : [];
  const usesMulticam = Boolean(cameraPlan || audioPlan.source === "external_audio");
  const fingerprintInput = videoProducerProductionFingerprintInput({ contentPlan: project.edit_plan, cameraPlan, audioPlan, media: usedMedia });
  return {
    rootProjectId,
    media: usedMedia,
    cameraB: cameraPlan ? cameraB : null,
    externalAudio: audioPlan.source === "external_audio" ? externalAudio : null,
    cameraBCoverage,
    cameraPlan,
    audioPlan,
    cameraRanges,
    fingerprint: videoProducerPlanFingerprint(fingerprintInput),
    usesMulticam
  };
}
