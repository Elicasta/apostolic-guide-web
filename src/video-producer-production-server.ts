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
import {
  compileVideoProducerVisualPlacements,
  videoProducerVisualFingerprintInput,
  type VideoProducerCompiledVisualPlacement,
  type VideoProducerVisualAsset,
  type VideoProducerVisualPlacement
} from "./video-producer-visuals";
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

export type VideoProducerResolvedVisual = {
  placement: VideoProducerCompiledVisualPlacement;
  asset: VideoProducerVisualAsset;
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
  visuals: VideoProducerResolvedVisual[];
  fingerprint: string;
  usesMulticam: boolean;
  usesVisuals: boolean;
};

function rangeCovered(start: number, end: number, coverage: { start: number; end: number }) {
  return start >= coverage.start - 0.03 && end <= coverage.end + 0.03;
}

function visualPlacement(row: Record<string, unknown>): VideoProducerVisualPlacement {
  return {
    id: String(row.id), projectId: String(row.project_id), beatId: String(row.beat_id), assetId: String(row.asset_id),
    sourceStart: Number(row.source_start), sourceEnd: Number(row.source_end), assetIn: Number(row.asset_in), assetOut: Number(row.asset_out),
    fit: row.fit === "contain" ? "contain" : "cover", positionX: Number(row.position_x ?? 0.5), positionY: Number(row.position_y ?? 0.5),
    scale: Number(row.scale ?? 1), layer: Number(row.layer ?? 2), audioEnabled: false,
    source: row.source === "manual" ? "manual" : "auto", locked: Boolean(row.locked), revision: Number(row.revision || 1)
  };
}

function visualAsset(row: Record<string, unknown>): VideoProducerVisualAsset {
  return {
    id: String(row.id), sourceProvider: String(row.source_provider) as VideoProducerVisualAsset["sourceProvider"],
    providerAssetId: typeof row.provider_asset_id === "string" ? row.provider_asset_id : null,
    sourceUrl: typeof row.source_url === "string" ? row.source_url : null, creator: typeof row.creator === "string" ? row.creator : null,
    licenseName: typeof row.license_name === "string" ? row.license_name : null, licenseUrl: typeof row.license_url === "string" ? row.license_url : null,
    licenseSnapshot: typeof row.license_snapshot === "string" ? row.license_snapshot : null, retrievedAt: String(row.retrieved_at),
    storageProvider: "vercel_blob", storageLocator: String(row.storage_locator), filename: String(row.filename), mimeType: String(row.mime_type),
    sizeBytes: Number(row.size_bytes || 0), sha256: typeof row.sha256 === "string" ? row.sha256 : null,
    duration: row.duration == null ? null : Number(row.duration), width: row.width == null ? null : Number(row.width),
    height: row.height == null ? null : Number(row.height), fps: row.fps == null ? null : Number(row.fps),
    tags: Array.isArray(row.tags) ? row.tags.filter((value): value is string => typeof value === "string") : [],
    description: typeof row.description === "string" ? row.description : null,
    generationPrompt: typeof row.generation_prompt === "string" ? row.generation_prompt : null,
    generationModel: typeof row.generation_model === "string" ? row.generation_model : null,
    reusable: Boolean(row.reusable), rightsFlags: row.rights_flags && typeof row.rights_flags === "object" ? row.rights_flags as Record<string, boolean> : {},
    revision: Number(row.revision || 1)
  };
}

export async function resolveVideoProducerProductionState(service: ServiceClient, project: VideoProducerProductionProject): Promise<VideoProducerResolvedProduction> {
  const rootProjectId = project.parent_project_id || project.id;
  const [assetsResult, visualResult] = await Promise.all([
    service.from("video_producer_media_assets")
      .select("id,project_id,role,storage_provider,storage_locator,filename,mime_type,size_bytes,duration,has_audio,sync_status,sync_method,offset_seconds,sync_confidence,sync_metadata,revision,active")
      .eq("project_id", rootProjectId).eq("active", true),
    service.from("video_producer_visual_placements")
      .select("id,project_id,beat_id,asset_id,source_start,source_end,asset_in,asset_out,fit,position_x,position_y,scale,layer,audio_enabled,source,locked,revision,active,asset:video_producer_visual_assets(id,source_provider,provider_asset_id,source_url,creator,license_name,license_url,license_snapshot,retrieved_at,storage_provider,storage_locator,filename,mime_type,size_bytes,sha256,duration,width,height,fps,tags,description,generation_prompt,generation_model,reusable,rights_flags,revision)")
      .eq("project_id", project.id).eq("active", true).order("source_start")
  ]);
  if (assetsResult.error) throw new Error(assetsResult.error.message);
  if (visualResult.error) throw new Error(visualResult.error.message);
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
    if (Number(externalAudio.revision || 1) !== Number(requestedAudio.syncRevision || 0)) throw new Error("External Audio synchronization changed after it was selected. Re-select the master audio before approval.");
    const coverage = mediaLocalCoverage(Number(externalAudio.duration), Number(externalAudio.offset_seconds), Number(project.source_range_start || 0), project.source_range_end != null ? Number(project.source_range_end) : null);
    const keepSegments = buildKeepSegments(project.edit_plan.cuts, duration);
    if (!coverage || keepSegments.some((segment) => !rangeCovered(segment.start, segment.end, coverage))) throw new Error("External Audio does not cover every kept part of this edit. Correct the sync/recording range or use Camera A audio.");
    audioPlan = { ...requestedAudio, offsetSeconds: Number(externalAudio.offset_seconds) };
  }

  const rawVisuals = (visualResult.data ?? []).map((row) => {
    const value = row as unknown as Record<string, unknown>;
    const assetRecord = value.asset && typeof value.asset === "object" ? value.asset as Record<string, unknown> : null;
    if (!assetRecord) throw new Error("A Visual Pass placement references missing media.");
    const placement = visualPlacement(value);
    const asset = visualAsset(assetRecord);
    if (!asset.mimeType.startsWith("video/")) throw new Error(`Visual asset ${asset.filename} is not renderable video.`);
    if (asset.duration != null && placement.assetOut > asset.duration + 0.05) throw new Error(`Visual placement exceeds ${asset.filename} duration.`);
    const placementDuration = placement.sourceEnd - placement.sourceStart;
    const selectedAssetDuration = placement.assetOut - placement.assetIn;
    if (placementDuration > selectedAssetDuration + 0.05) throw new Error(`Visual placement outlasts the selected range from ${asset.filename}. Shorten the placement or extend its asset range.`);
    return { placement, asset };
  });
  const compiledPlacements = compileVideoProducerVisualPlacements(rawVisuals.map((item) => item.placement), project.edit_plan.cuts, duration);
  const compiledById = new Map(compiledPlacements.map((placement) => [placement.id, placement]));
  const visuals: VideoProducerResolvedVisual[] = rawVisuals.flatMap((item) => {
    const placement = compiledById.get(item.placement.id);
    return placement ? [{ placement, asset: item.asset }] : [];
  });

  const usedMedia = media.filter((asset) => (cameraPlan && asset.role === "camera_b") || (audioPlan.source === "external_audio" && asset.role === "external_audio"));
  const cameraRanges = cameraPlan ? compileCameraRangesThroughContentCuts(cameraPlan, project.edit_plan.cuts, duration, cameraBCoverage) : [];
  const usesMulticam = Boolean(cameraPlan || audioPlan.source === "external_audio");
  const usesVisuals = visuals.length > 0;
  const baseFingerprintInput = videoProducerProductionFingerprintInput({ contentPlan: project.edit_plan, cameraPlan, audioPlan, media: usedMedia });
  const visualFingerprint = videoProducerVisualFingerprintInput({ placements: visuals.map((item) => item.placement), assets: visuals.map((item) => item.asset) });
  const fingerprintInput = usesVisuals ? { version: 2, production: baseFingerprintInput, visuals: visualFingerprint } : baseFingerprintInput;
  return {
    rootProjectId, media: usedMedia, cameraB: cameraPlan ? cameraB : null,
    externalAudio: audioPlan.source === "external_audio" ? externalAudio : null,
    cameraBCoverage, cameraPlan, audioPlan, cameraRanges, visuals,
    fingerprint: videoProducerPlanFingerprint(fingerprintInput), usesMulticam, usesVisuals
  };
}
