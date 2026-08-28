import "server-only";
import type { createServiceClient } from "./supabase";
import type { VideoProducerEditPlan } from "./video-producer";
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
    ? mediaLocalCoverage(
        Number(cameraB.duration),
        Number(cameraB.offset_seconds),
        Number(project.source_range_start || 0),
        project.source_range_end != null ? Number(project.source_range_end) : null
      )
    : null;
  const rawCameraPlan = project.camera_plan && cameraBReady && cameraBCoverage
    ? normalizeVideoProducerCameraPlan(project.camera_plan, duration, cameraBCoverage)
    : null;
  const cameraPlan = rawCameraPlan?.decisions.some((decision) => decision.camera === "B") ? rawCameraPlan : null;

  const requestedAudio = project.audio_plan?.version === 1 ? project.audio_plan : defaultVideoProducerAudioPlan();
  let audioPlan: VideoProducerAudioPlan = defaultVideoProducerAudioPlan();
  if (requestedAudio.source === "external_audio") {
    if (!externalAudio || externalAudio.id !== requestedAudio.assetId || !["synced", "manual"].includes(externalAudio.sync_status) || externalAudio.offset_seconds == null) {
      throw new Error("The selected External Audio is no longer synchronized. Choose Camera A audio or synchronize the recorder again.");
    }
    if (Number(externalAudio.revision || 1) !== Number(requestedAudio.syncRevision || 0)) {
      throw new Error("External Audio synchronization changed after it was selected. Re-select the master audio before approval.");
    }
    audioPlan = { ...requestedAudio, offsetSeconds: Number(externalAudio.offset_seconds) };
  }

  const usedMedia = media.filter((asset) =>
    (cameraPlan && asset.role === "camera_b") || (audioPlan.source === "external_audio" && asset.role === "external_audio")
  );
  const cameraRanges = cameraPlan
    ? compileCameraRangesThroughContentCuts(cameraPlan, project.edit_plan.cuts, duration, cameraBCoverage)
    : [];
  const usesMulticam = Boolean(cameraPlan || audioPlan.source === "external_audio");
  const fingerprintInput = videoProducerProductionFingerprintInput({
    contentPlan: project.edit_plan,
    cameraPlan,
    audioPlan,
    media: usedMedia
  });
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
