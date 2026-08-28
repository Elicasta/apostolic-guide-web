import type { VideoProducerCut, VideoProducerKeepSegment } from "./video-producer";
import { buildKeepSegments } from "./video-producer";

export type VideoProducerMediaRole = "camera_b" | "external_audio";
export type VideoProducerSyncStatus = "uploading" | "analyzing" | "syncing" | "synced" | "needs_review" | "failed" | "manual";
export type VideoProducerSyncMethod = "waveform" | "manual" | null;
export type VideoProducerCameraId = "A" | "B";

export type VideoProducerMediaAsset = {
  id: string;
  project_id: string;
  role: VideoProducerMediaRole;
  storage_provider: string;
  storage_locator: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  duration: number | null;
  has_audio: boolean | null;
  sync_status: VideoProducerSyncStatus;
  sync_method: VideoProducerSyncMethod;
  offset_seconds: number | null;
  sync_confidence: number | null;
  sync_metadata?: Record<string, unknown> | null;
  revision: number;
  active: boolean;
};

export type VideoProducerCameraDecision = {
  id: string;
  at: number;
  camera: VideoProducerCameraId;
  reason?: string;
  source: "auto" | "manual";
  locked: boolean;
};

export type VideoProducerCameraPlan = {
  version: 1;
  defaultCamera: "A";
  decisions: VideoProducerCameraDecision[];
  generatedAt?: string;
  sourceRevision?: number;
};

export type VideoProducerAudioPlan =
  | { version: 1; source: "camera_a" }
  | { version: 1; source: "external_audio"; assetId: string; offsetSeconds: number; syncRevision: number };

export type VideoProducerCameraSegment = {
  camera: VideoProducerCameraId;
  start: number;
  end: number;
};

export type VideoProducerCompiledCameraRange = VideoProducerCameraSegment & {
  outputStart: number;
  outputEnd: number;
};

export type VideoProducerCoverage = { start: number; end: number };

const finite = (value: number, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, finite(value, min)));

export function assetTimeToProjectTime(assetTime: number, offsetSeconds: number) {
  return finite(assetTime) + finite(offsetSeconds);
}

export function projectTimeToAssetTime(projectTime: number, offsetSeconds: number) {
  return finite(projectTime) - finite(offsetSeconds);
}

export function mediaProjectCoverage(duration: number, offsetSeconds: number): VideoProducerCoverage {
  const start = finite(offsetSeconds);
  return { start, end: start + Math.max(0, finite(duration)) };
}

export function mediaLocalCoverage(
  duration: number,
  offsetSeconds: number,
  sourceRangeStart = 0,
  sourceRangeEnd?: number | null
): VideoProducerCoverage | null {
  const global = mediaProjectCoverage(duration, offsetSeconds);
  const localDuration = sourceRangeEnd != null
    ? Math.max(0, finite(sourceRangeEnd) - finite(sourceRangeStart))
    : Math.max(0, finite(duration) + Math.max(0, global.start));
  const windowStart = finite(sourceRangeStart);
  const windowEnd = sourceRangeEnd != null ? finite(sourceRangeEnd) : windowStart + localDuration;
  const overlapStart = Math.max(windowStart, global.start);
  const overlapEnd = Math.min(windowEnd, global.end);
  if (overlapEnd <= overlapStart) return null;
  return { start: overlapStart - windowStart, end: overlapEnd - windowStart };
}

export function normalizeVideoProducerCameraPlan(
  value: VideoProducerCameraPlan | null | undefined,
  duration: number,
  cameraBCoverage?: VideoProducerCoverage | null
): VideoProducerCameraPlan {
  const safeDuration = Math.max(0, finite(duration));
  const raw = value?.version === 1 && Array.isArray(value.decisions) ? value.decisions : [];
  const decisions = raw
    .map((decision, index): VideoProducerCameraDecision => ({
      id: decision.id || `camera-cut-${index + 1}`,
      at: clamp(decision.at, 0, safeDuration),
      camera: decision.camera === "B" ? "B" : "A",
      reason: typeof decision.reason === "string" && decision.reason.trim() ? decision.reason.trim().slice(0, 280) : undefined,
      source: decision.source === "manual" ? "manual" : "auto",
      locked: Boolean(decision.locked)
    }))
    .filter((decision) => decision.at > 0.02 && decision.at < safeDuration - 0.02)
    .filter((decision) => decision.camera !== "B" || Boolean(cameraBCoverage && decision.at >= cameraBCoverage.start && decision.at < cameraBCoverage.end))
    .sort((a, b) => a.at - b.at || Number(b.locked) - Number(a.locked));

  const normalized: VideoProducerCameraDecision[] = [];
  let current: VideoProducerCameraId = "A";
  for (const decision of decisions) {
    const previous = normalized.at(-1);
    if (previous && Math.abs(previous.at - decision.at) < 0.08) {
      if (decision.locked || !previous.locked) normalized[normalized.length - 1] = decision;
      current = normalized.at(-1)?.camera ?? current;
      continue;
    }
    if (decision.camera === current) continue;
    normalized.push(decision);
    current = decision.camera;
  }

  return {
    version: 1,
    defaultCamera: "A",
    decisions: normalized,
    generatedAt: value?.generatedAt,
    sourceRevision: value?.sourceRevision
  };
}

export function buildVideoProducerCameraSegments(
  plan: VideoProducerCameraPlan | null | undefined,
  duration: number,
  cameraBCoverage?: VideoProducerCoverage | null
): VideoProducerCameraSegment[] {
  const safeDuration = Math.max(0, finite(duration));
  if (safeDuration <= 0) return [];
  const normalized = normalizeVideoProducerCameraPlan(plan, safeDuration, cameraBCoverage);
  const segments: VideoProducerCameraSegment[] = [];
  let cursor = 0;
  let camera: VideoProducerCameraId = "A";
  for (const decision of normalized.decisions) {
    if (decision.at > cursor) segments.push({ camera, start: cursor, end: decision.at });
    camera = decision.camera;
    cursor = decision.at;
  }
  if (cursor < safeDuration) segments.push({ camera, start: cursor, end: safeDuration });

  if (!cameraBCoverage) return segments.map((segment) => segment.camera === "B" ? { ...segment, camera: "A" as const } : segment);
  const safe: VideoProducerCameraSegment[] = [];
  for (const segment of segments) {
    if (segment.camera === "A") {
      safe.push(segment);
      continue;
    }
    if (segment.start < cameraBCoverage.start) safe.push({ camera: "A", start: segment.start, end: Math.min(segment.end, cameraBCoverage.start) });
    const bStart = Math.max(segment.start, cameraBCoverage.start);
    const bEnd = Math.min(segment.end, cameraBCoverage.end);
    if (bEnd > bStart) safe.push({ camera: "B", start: bStart, end: bEnd });
    if (segment.end > cameraBCoverage.end) safe.push({ camera: "A", start: Math.max(segment.start, cameraBCoverage.end), end: segment.end });
  }
  return mergeCameraSegments(safe);
}

function mergeCameraSegments(segments: VideoProducerCameraSegment[]) {
  const merged: VideoProducerCameraSegment[] = [];
  for (const segment of segments.filter((item) => item.end > item.start).sort((a, b) => a.start - b.start)) {
    const previous = merged.at(-1);
    if (previous && previous.camera === segment.camera && Math.abs(previous.end - segment.start) <= 0.001) previous.end = segment.end;
    else merged.push({ ...segment });
  }
  return merged;
}

export function compileCameraRangesThroughContentCuts(
  cameraPlan: VideoProducerCameraPlan | null | undefined,
  contentCuts: VideoProducerCut[],
  duration: number,
  cameraBCoverage?: VideoProducerCoverage | null
): VideoProducerCompiledCameraRange[] {
  const cameraSegments = buildVideoProducerCameraSegments(cameraPlan, duration, cameraBCoverage);
  const keepSegments = buildKeepSegments(contentCuts, duration);
  const ranges: VideoProducerCompiledCameraRange[] = [];
  let outputCursor = 0;
  for (const keep of keepSegments) {
    for (const camera of cameraSegments) {
      const start = Math.max(keep.start, camera.start);
      const end = Math.min(keep.end, camera.end);
      if (end <= start) continue;
      ranges.push({
        camera: camera.camera,
        start,
        end,
        outputStart: outputCursor + (start - keep.start),
        outputEnd: outputCursor + (end - keep.start)
      });
    }
    outputCursor += keep.end - keep.start;
  }
  return mergeCompiledCameraRanges(ranges);
}

function mergeCompiledCameraRanges(ranges: VideoProducerCompiledCameraRange[]) {
  const merged: VideoProducerCompiledCameraRange[] = [];
  for (const range of ranges) {
    const previous = merged.at(-1);
    if (
      previous && previous.camera === range.camera &&
      Math.abs(previous.end - range.start) <= 0.001 &&
      Math.abs(previous.outputEnd - range.outputStart) <= 0.001
    ) {
      previous.end = range.end;
      previous.outputEnd = range.outputEnd;
    } else merged.push({ ...range });
  }
  return merged;
}

export function preserveLockedCameraDecisions(
  generated: VideoProducerCameraDecision[],
  existing: VideoProducerCameraPlan | null | undefined
) {
  const locked = (existing?.decisions ?? []).filter((decision) => decision.locked);
  return [...generated.filter((decision) => !locked.some((item) => Math.abs(item.at - decision.at) < 0.35)), ...locked]
    .sort((a, b) => a.at - b.at);
}

export function defaultVideoProducerAudioPlan(): VideoProducerAudioPlan {
  return { version: 1, source: "camera_a" };
}

export function videoProducerProductionFingerprintInput(input: {
  contentPlan: unknown;
  cameraPlan?: VideoProducerCameraPlan | null;
  audioPlan?: VideoProducerAudioPlan | null;
  media?: Array<Pick<VideoProducerMediaAsset, "id" | "role" | "revision" | "sync_status" | "offset_seconds" | "active">>;
}) {
  const activeMedia = (input.media ?? [])
    .filter((item) => item.active)
    .map((item) => ({ id: item.id, role: item.role, revision: item.revision, syncStatus: item.sync_status, offsetSeconds: item.offset_seconds }))
    .sort((a, b) => a.role.localeCompare(b.role) || a.id.localeCompare(b.id));
  if (!input.cameraPlan && (!input.audioPlan || input.audioPlan.source === "camera_a") && activeMedia.length === 0) return input.contentPlan;
  return {
    version: 1,
    contentPlan: input.contentPlan,
    cameraPlan: input.cameraPlan ?? { version: 1, defaultCamera: "A", decisions: [] },
    audioPlan: input.audioPlan ?? defaultVideoProducerAudioPlan(),
    media: activeMedia
  };
}

export function keepSegmentsDuration(segments: VideoProducerKeepSegment[]) {
  return segments.reduce((sum, segment) => sum + Math.max(0, segment.end - segment.start), 0);
}
