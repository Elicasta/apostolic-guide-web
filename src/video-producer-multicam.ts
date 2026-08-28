export const VIDEO_PRODUCER_PRIMARY_CAMERA_ID = "camera-a";
export const VIDEO_PRODUCER_MIN_SYNC_CONFIDENCE = 0.42;

export type VideoProducerCameraSource = {
  id: string;
  label: string;
  provider: "vercel_blob";
  locator: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  duration?: number | null;
};

export type VideoProducerExternalAudioSource = {
  provider: "vercel_blob";
  locator: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  duration?: number | null;
};

export type VideoProducerCameraDecision = {
  id: string;
  sourceId: string;
  start: number;
  end: number;
};

export type VideoProducerMulticamAnalysis = {
  status: "idle" | "queued" | "analyzing" | "ready" | "failed";
  jobId?: string | null;
  callbackTokenHash?: string | null;
  requestedAt?: string | null;
  completedAt?: string | null;
  error?: string | null;
  cameraOffsetsMs: Record<string, number>;
  cameraConfidence: Record<string, number>;
  externalAudioOffsetMs?: number | null;
  externalAudioConfidence?: number | null;
  primaryDuration?: number | null;
  cameraDurations: Record<string, number>;
  externalAudioDuration?: number | null;
  waveforms: Record<string, number[]>;
};

export type VideoProducerMulticamMetadata = {
  version: 1;
  cameras: VideoProducerCameraSource[];
  externalAudio?: VideoProducerExternalAudioSource | null;
  analysis: VideoProducerMulticamAnalysis;
  editDecisions: VideoProducerCameraDecision[];
};

type TranscriptLike = {
  words?: Array<{ start?: number; end?: number; word?: string }>;
  segments?: Array<{ start?: number; end?: number; text?: string }>;
};

const finite = (value: unknown, fallback = 0) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

function cleanId(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80) : "";
}

function cleanWaveform(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 300).map((item) => Math.round(clamp(finite(item), 0, 100)));
}

function emptyAnalysis(): VideoProducerMulticamAnalysis {
  return {
    status: "idle",
    cameraOffsetsMs: {},
    cameraConfidence: {},
    cameraDurations: {},
    waveforms: {}
  };
}

export function emptyVideoProducerMulticamMetadata(): VideoProducerMulticamMetadata {
  return { version: 1, cameras: [], analysis: emptyAnalysis(), editDecisions: [] };
}

export function getVideoProducerMulticamMetadata(directorMetadata: unknown): VideoProducerMulticamMetadata {
  const root = directorMetadata && typeof directorMetadata === "object" ? directorMetadata as Record<string, unknown> : {};
  const raw = root.multicam && typeof root.multicam === "object" ? root.multicam as Record<string, unknown> : {};
  const cameras = Array.isArray(raw.cameras) ? raw.cameras.flatMap((value, index) => {
    if (!value || typeof value !== "object") return [];
    const item = value as Record<string, unknown>;
    const id = cleanId(item.id);
    const locator = typeof item.locator === "string" ? item.locator.trim() : "";
    const filename = typeof item.filename === "string" ? item.filename.trim() : "";
    if (!id || id === VIDEO_PRODUCER_PRIMARY_CAMERA_ID || !locator || !filename || item.provider !== "vercel_blob") return [];
    return [{
      id,
      label: typeof item.label === "string" && item.label.trim() ? item.label.trim().slice(0, 60) : `Camera ${String.fromCharCode(66 + index)}`,
      provider: "vercel_blob" as const,
      locator,
      filename,
      mimeType: typeof item.mimeType === "string" ? item.mimeType : "video/mp4",
      sizeBytes: Math.max(0, Math.round(finite(item.sizeBytes))),
      duration: item.duration == null ? null : Math.max(0, finite(item.duration))
    }];
  }) : [];

  const rawAudio = raw.externalAudio && typeof raw.externalAudio === "object" ? raw.externalAudio as Record<string, unknown> : null;
  const externalAudio = rawAudio && rawAudio.provider === "vercel_blob" && typeof rawAudio.locator === "string" && typeof rawAudio.filename === "string"
    ? {
        provider: "vercel_blob" as const,
        locator: rawAudio.locator,
        filename: rawAudio.filename,
        mimeType: typeof rawAudio.mimeType === "string" ? rawAudio.mimeType : "audio/wav",
        sizeBytes: Math.max(0, Math.round(finite(rawAudio.sizeBytes))),
        duration: rawAudio.duration == null ? null : Math.max(0, finite(rawAudio.duration))
      }
    : null;

  const rawAnalysis = raw.analysis && typeof raw.analysis === "object" ? raw.analysis as Record<string, unknown> : {};
  const statuses = new Set(["idle", "queued", "analyzing", "ready", "failed"]);
  const cameraOffsetsMs: Record<string, number> = {};
  const cameraConfidence: Record<string, number> = {};
  const cameraDurations: Record<string, number> = {};
  const waveforms: Record<string, number[]> = {};
  const allowedIds = new Set(cameras.map((camera) => camera.id));

  for (const [key, value] of Object.entries(rawAnalysis.cameraOffsetsMs && typeof rawAnalysis.cameraOffsetsMs === "object" ? rawAnalysis.cameraOffsetsMs as Record<string, unknown> : {})) {
    if (allowedIds.has(key) && Number.isFinite(Number(value))) cameraOffsetsMs[key] = finite(value);
  }
  for (const [key, value] of Object.entries(rawAnalysis.cameraConfidence && typeof rawAnalysis.cameraConfidence === "object" ? rawAnalysis.cameraConfidence as Record<string, unknown> : {})) {
    if (allowedIds.has(key) && Number.isFinite(Number(value))) cameraConfidence[key] = clamp(finite(value), 0, 1);
  }
  for (const [key, value] of Object.entries(rawAnalysis.cameraDurations && typeof rawAnalysis.cameraDurations === "object" ? rawAnalysis.cameraDurations as Record<string, unknown> : {})) {
    if (allowedIds.has(key) && Number.isFinite(Number(value))) cameraDurations[key] = Math.max(0, finite(value));
  }
  for (const [key, value] of Object.entries(rawAnalysis.waveforms && typeof rawAnalysis.waveforms === "object" ? rawAnalysis.waveforms as Record<string, unknown> : {})) {
    if (key === VIDEO_PRODUCER_PRIMARY_CAMERA_ID || key === "external-audio" || allowedIds.has(key)) waveforms[key] = cleanWaveform(value);
  }

  const analysis: VideoProducerMulticamAnalysis = {
    status: statuses.has(String(rawAnalysis.status)) ? rawAnalysis.status as VideoProducerMulticamAnalysis["status"] : "idle",
    jobId: typeof rawAnalysis.jobId === "string" ? rawAnalysis.jobId : null,
    callbackTokenHash: typeof rawAnalysis.callbackTokenHash === "string" ? rawAnalysis.callbackTokenHash : null,
    requestedAt: typeof rawAnalysis.requestedAt === "string" ? rawAnalysis.requestedAt : null,
    completedAt: typeof rawAnalysis.completedAt === "string" ? rawAnalysis.completedAt : null,
    error: typeof rawAnalysis.error === "string" ? rawAnalysis.error : null,
    cameraOffsetsMs,
    cameraConfidence,
    externalAudioOffsetMs: rawAnalysis.externalAudioOffsetMs == null ? null : finite(rawAnalysis.externalAudioOffsetMs),
    externalAudioConfidence: rawAnalysis.externalAudioConfidence == null ? null : clamp(finite(rawAnalysis.externalAudioConfidence), 0, 1),
    primaryDuration: rawAnalysis.primaryDuration == null ? null : Math.max(0, finite(rawAnalysis.primaryDuration)),
    cameraDurations,
    externalAudioDuration: rawAnalysis.externalAudioDuration == null ? null : Math.max(0, finite(rawAnalysis.externalAudioDuration)),
    waveforms
  };

  const editDecisions = Array.isArray(raw.editDecisions) ? raw.editDecisions.flatMap((value, index) => {
    if (!value || typeof value !== "object") return [];
    const item = value as Record<string, unknown>;
    const sourceId = cleanId(item.sourceId);
    const start = finite(item.start, Number.NaN);
    const end = finite(item.end, Number.NaN);
    if ((!allowedIds.has(sourceId) && sourceId !== VIDEO_PRODUCER_PRIMARY_CAMERA_ID) || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
    return [{ id: cleanId(item.id) || `camera-cut-${index + 1}`, sourceId, start, end }];
  }) : [];

  return { version: 1, cameras, externalAudio, analysis, editDecisions };
}

export function withVideoProducerMulticamMetadata(directorMetadata: unknown, multicam: VideoProducerMulticamMetadata) {
  const root = directorMetadata && typeof directorMetadata === "object" ? { ...(directorMetadata as Record<string, unknown>) } : {};
  root.multicam = multicam;
  return root;
}

export function normalizeVideoProducerCameraDecisions(
  decisions: VideoProducerCameraDecision[],
  duration: number,
  cameraIds: string[]
): VideoProducerCameraDecision[] {
  const endTime = Math.max(0, finite(duration));
  if (endTime <= 0) return [];
  const allowed = new Set([VIDEO_PRODUCER_PRIMARY_CAMERA_ID, ...cameraIds.map(cleanId).filter(Boolean)]);
  const source = decisions
    .map((decision, index) => ({
      id: cleanId(decision.id) || `camera-cut-${index + 1}`,
      sourceId: allowed.has(cleanId(decision.sourceId)) ? cleanId(decision.sourceId) : VIDEO_PRODUCER_PRIMARY_CAMERA_ID,
      start: clamp(finite(decision.start), 0, endTime),
      end: clamp(finite(decision.end), 0, endTime)
    }))
    .filter((decision) => decision.end - decision.start >= 0.04)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const filled: VideoProducerCameraDecision[] = [];
  let cursor = 0;
  for (const decision of source) {
    if (decision.end <= cursor) continue;
    const start = Math.max(cursor, decision.start);
    if (start > cursor + 0.001) filled.push({ id: `camera-fill-${filled.length + 1}`, sourceId: VIDEO_PRODUCER_PRIMARY_CAMERA_ID, start: cursor, end: start });
    filled.push({ ...decision, start });
    cursor = decision.end;
  }
  if (cursor < endTime) filled.push({ id: `camera-fill-${filled.length + 1}`, sourceId: VIDEO_PRODUCER_PRIMARY_CAMERA_ID, start: cursor, end: endTime });
  if (!filled.length) filled.push({ id: "camera-cut-1", sourceId: VIDEO_PRODUCER_PRIMARY_CAMERA_ID, start: 0, end: endTime });

  const merged: VideoProducerCameraDecision[] = [];
  for (const decision of filled) {
    const previous = merged.at(-1);
    if (previous && previous.sourceId === decision.sourceId && Math.abs(previous.end - decision.start) < 0.02) {
      previous.end = decision.end;
    } else {
      merged.push({ ...decision, id: `camera-cut-${merged.length + 1}` });
    }
  }
  return merged;
}

function transcriptBoundaries(transcript: TranscriptLike | null | undefined, duration: number) {
  const boundaries = new Set<number>([0, duration]);
  const words = Array.isArray(transcript?.words) ? transcript.words : [];
  for (let index = 0; index < words.length - 1; index += 1) {
    const end = finite(words[index]?.end, Number.NaN);
    const next = finite(words[index + 1]?.start, Number.NaN);
    if (Number.isFinite(end) && Number.isFinite(next) && next - end >= 0.22) boundaries.add(clamp((end + next) / 2, 0, duration));
  }
  for (const segment of Array.isArray(transcript?.segments) ? transcript.segments : []) {
    const end = finite(segment.end, Number.NaN);
    if (Number.isFinite(end)) boundaries.add(clamp(end, 0, duration));
  }
  return [...boundaries].sort((a, b) => a - b);
}

export function buildSmartVideoProducerCameraDecisions(
  transcript: TranscriptLike | null | undefined,
  duration: number,
  cameraIds: string[]
): VideoProducerCameraDecision[] {
  const endTime = Math.max(0, finite(duration));
  const secondary = cameraIds.map(cleanId).filter(Boolean);
  if (endTime <= 0 || !secondary.length) return endTime > 0 ? [{ id: "camera-cut-1", sourceId: VIDEO_PRODUCER_PRIMARY_CAMERA_ID, start: 0, end: endTime }] : [];
  const boundaries = transcriptBoundaries(transcript, endTime);
  const cuts = [0];
  let cursor = 0;
  const target = 6.5;
  const min = 3.4;
  const max = 10;
  while (endTime - cursor > max) {
    const ideal = cursor + target;
    const candidates = boundaries.filter((point) => point >= cursor + min && point <= cursor + max);
    const next = candidates.length ? candidates.reduce((best, point) => Math.abs(point - ideal) < Math.abs(best - ideal) ? point : best, candidates[0]) : Math.min(endTime, ideal);
    if (next <= cursor + 0.04) break;
    cuts.push(next);
    cursor = next;
  }
  if (endTime - cuts.at(-1)! < min && cuts.length > 1) cuts.pop();
  cuts.push(endTime);

  const cameraPattern = [VIDEO_PRODUCER_PRIMARY_CAMERA_ID, ...secondary, VIDEO_PRODUCER_PRIMARY_CAMERA_ID, VIDEO_PRODUCER_PRIMARY_CAMERA_ID, ...secondary];
  const decisions: VideoProducerCameraDecision[] = [];
  for (let index = 0; index < cuts.length - 1; index += 1) {
    decisions.push({
      id: `camera-cut-${index + 1}`,
      sourceId: cameraPattern[index % cameraPattern.length],
      start: cuts[index],
      end: cuts[index + 1]
    });
  }
  return normalizeVideoProducerCameraDecisions(decisions, endTime, secondary);
}

export function videoProducerMulticamFingerprintState(directorMetadata: unknown) {
  const multicam = getVideoProducerMulticamMetadata(directorMetadata);
  const readyCameras = multicam.cameras.flatMap((camera) => {
    const offset = multicam.analysis.cameraOffsetsMs[camera.id];
    if (!Number.isFinite(offset)) return [];
    return [{ id: camera.id, locator: camera.locator, duration: multicam.analysis.cameraDurations[camera.id] ?? camera.duration ?? null, offsetMs: offset }];
  });
  const decisions = multicam.editDecisions.filter((decision) => decision.sourceId === VIDEO_PRODUCER_PRIMARY_CAMERA_ID || readyCameras.some((camera) => camera.id === decision.sourceId));
  const external = multicam.externalAudio && Number.isFinite(multicam.analysis.externalAudioOffsetMs)
    ? {
        locator: multicam.externalAudio.locator,
        duration: multicam.analysis.externalAudioDuration ?? multicam.externalAudio.duration ?? null,
        offsetMs: multicam.analysis.externalAudioOffsetMs
      }
    : null;
  const usesSecondaryCamera = decisions.some((decision) => decision.sourceId !== VIDEO_PRODUCER_PRIMARY_CAMERA_ID);
  if (!usesSecondaryCamera && !external) return null;
  return {
    version: 1,
    cameras: readyCameras,
    externalAudio: external,
    editDecisions: decisions.map(({ sourceId, start, end }) => ({ sourceId, start, end }))
  };
}

export function hasEffectiveVideoProducerMulticam(directorMetadata: unknown) {
  return videoProducerMulticamFingerprintState(directorMetadata) !== null;
}
