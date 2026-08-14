export type VideoProducerStatus =
  | "draft"
  | "uploading"
  | "transcribing"
  | "analyzing"
  | "planned"
  | "rendering"
  | "review"
  | "approved"
  | "failed";

export type VideoProducerOverlayKind =
  | "scripture"
  | "pathway"
  | "lower-third"
  | "chapter"
  | "statement"
  | "quote"
  | "cta";

export type VideoProducerCut = {
  id: string;
  start: number;
  end: number;
  reason?: string;
};

export type VideoProducerOverlay = {
  id: string;
  kind: VideoProducerOverlayKind;
  start: number;
  duration: number;
  title: string;
  body?: string;
  reference?: string;
};

export type VideoProducerMusicCue = {
  id: string;
  trackId: string;
  start: number;
  end: number;
  gainDb: number;
  duckUnderVoice: boolean;
};

export type VideoProducerEditPlan = {
  version: 1;
  sourceDuration: number;
  cuts: VideoProducerCut[];
  overlays: VideoProducerOverlay[];
  music: VideoProducerMusicCue[];
  audioPreset: "ag-voice-clean" | "none";
  colorPreset: "ag-studio" | "ag-warm" | "ag-clean" | "none";
  intro: boolean;
  outro: boolean;
};

export type VideoProducerKeepSegment = { start: number; end: number };

export type VideoProducerRenderPlan = {
  version: 1;
  sourceDuration: number;
  outputDuration: number;
  keepSegments: VideoProducerKeepSegment[];
  overlays: (VideoProducerOverlay & { outputStart: number | null })[];
  music: VideoProducerMusicCue[];
  audioPreset: VideoProducerEditPlan["audioPreset"];
  colorPreset: VideoProducerEditPlan["colorPreset"];
  intro: boolean;
  outro: boolean;
  output: { format: "mp4"; width: 1920; height: 1080; fps: 30 };
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function normalizeVideoProducerCuts(cuts: VideoProducerCut[], duration: number): VideoProducerCut[] {
  if (!Number.isFinite(duration) || duration <= 0) return [];
  const normalized = cuts
    .map((cut, index) => ({
      ...cut,
      id: cut.id || `cut-${index + 1}`,
      start: clamp(Number(cut.start) || 0, 0, duration),
      end: clamp(Number(cut.end) || 0, 0, duration)
    }))
    .filter((cut) => cut.end > cut.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const merged: VideoProducerCut[] = [];
  for (const cut of normalized) {
    const previous = merged.at(-1);
    if (previous && cut.start <= previous.end + 0.05) {
      previous.end = Math.max(previous.end, cut.end);
      previous.reason = [previous.reason, cut.reason].filter(Boolean).join("; ") || undefined;
      continue;
    }
    merged.push({ ...cut });
  }
  return merged;
}

export function buildKeepSegments(cuts: VideoProducerCut[], duration: number): VideoProducerKeepSegment[] {
  const normalized = normalizeVideoProducerCuts(cuts, duration);
  const result: VideoProducerKeepSegment[] = [];
  let cursor = 0;
  for (const cut of normalized) {
    if (cut.start > cursor) result.push({ start: cursor, end: cut.start });
    cursor = Math.max(cursor, cut.end);
  }
  if (cursor < duration) result.push({ start: cursor, end: duration });
  return result;
}

export function outputDurationForPlan(plan: Pick<VideoProducerEditPlan, "sourceDuration" | "cuts">): number {
  const removed = normalizeVideoProducerCuts(plan.cuts, plan.sourceDuration)
    .reduce((sum, cut) => sum + cut.end - cut.start, 0);
  return Math.max(0, plan.sourceDuration - removed);
}

export function sourceTimeToOutputTime(sourceTime: number, cuts: VideoProducerCut[], duration: number): number | null {
  const time = clamp(sourceTime, 0, duration);
  const normalized = normalizeVideoProducerCuts(cuts, duration);
  let removed = 0;
  for (const cut of normalized) {
    if (time >= cut.start && time < cut.end) return null;
    if (cut.end <= time) removed += cut.end - cut.start;
  }
  return time - removed;
}

export function compileVideoProducerRenderPlan(plan: VideoProducerEditPlan): VideoProducerRenderPlan {
  const cuts = normalizeVideoProducerCuts(plan.cuts, plan.sourceDuration);
  return {
    version: 1,
    sourceDuration: plan.sourceDuration,
    outputDuration: outputDurationForPlan({ sourceDuration: plan.sourceDuration, cuts }),
    keepSegments: buildKeepSegments(cuts, plan.sourceDuration),
    overlays: plan.overlays.map((overlay) => ({
      ...overlay,
      outputStart: sourceTimeToOutputTime(overlay.start, cuts, plan.sourceDuration)
    })),
    music: plan.music,
    audioPreset: plan.audioPreset,
    colorPreset: plan.colorPreset,
    intro: plan.intro,
    outro: plan.outro,
    output: { format: "mp4", width: 1920, height: 1080, fps: 30 }
  };
}

export function formatProducerTime(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}
