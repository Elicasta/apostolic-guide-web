export type VideoProducerMode = "podcast" | "reels";

export type VideoProducerStatus =
  | "draft"
  | "uploading"
  | "uploaded"
  | "transcribing"
  | "directing"
  | "planned"
  | "approved"
  | "rendering"
  | "review"
  | "completed"
  | "failed";

export type VideoProducerOverlayKind =
  | "scripture"
  | "pathway"
  | "lower-third"
  | "chapter"
  | "statement"
  | "quote"
  | "cta";

export type VideoProducerOverlayAnimation = "fade" | "rise" | "slide" | "pop" | "wipe" | "none";
export type VideoProducerOverlayPlacement = "top" | "center" | "lower-third" | "full-frame";
export type VideoProducerMotionKind = "punch-in" | "reframe" | "emphasis" | "b-roll";
export type VideoProducerCaptionStyle = "kinetic-clean" | "word-pop" | "editorial" | "minimal";
export type VideoProducerCaptionAnimation = "pop" | "rise" | "highlight" | "none";

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
  animation?: VideoProducerOverlayAnimation;
  placement?: VideoProducerOverlayPlacement;
};

export type VideoProducerMotionTransform = {
  focusX: number;
  focusY: number;
  scale: number;
};

export type VideoProducerMotionCue = {
  id: string;
  kind: VideoProducerMotionKind;
  start: number;
  duration: number;
  intensity?: "subtle" | "medium" | "strong";
  transform?: VideoProducerMotionTransform;
  note?: string;
};

export type VideoProducerMusicCue = {
  id: string;
  trackId: string;
  start: number;
  end: number;
  gainDb: number;
  duckUnderVoice: boolean;
};

export type VideoProducerCaptionConfig = {
  enabled: boolean;
  style: VideoProducerCaptionStyle;
  animation: VideoProducerCaptionAnimation;
  maxWordsPerCard: number;
  position: "lower" | "center";
  highlightCurrentWord: boolean;
};

export type VideoProducerEditPlan = {
  version: 2;
  mode: VideoProducerMode;
  sourceDuration: number;
  cuts: VideoProducerCut[];
  overlays: VideoProducerOverlay[];
  motion: VideoProducerMotionCue[];
  music: VideoProducerMusicCue[];
  captions: VideoProducerCaptionConfig;
  audioPreset: "ag-voice-clean" | "ag-voice-punch" | "none";
  colorPreset: "ag-studio" | "ag-warm" | "ag-clean" | "none";
  intro: boolean;
  outro: boolean;
};

export type VideoProducerKeepSegment = { start: number; end: number };
export type VideoProducerOutputRange = { sourceStart: number; sourceEnd: number; outputStart: number; outputEnd: number };

export type VideoProducerRenderPlan = {
  version: 2;
  mode: VideoProducerMode;
  sourceDuration: number;
  outputDuration: number;
  keepSegments: VideoProducerKeepSegment[];
  overlays: (VideoProducerOverlay & { outputStart: number | null; outputRanges: VideoProducerOutputRange[] })[];
  motion: (VideoProducerMotionCue & { outputStart: number | null; outputRanges: VideoProducerOutputRange[] })[];
  music: (VideoProducerMusicCue & { outputRanges: VideoProducerOutputRange[] })[];
  captions: VideoProducerCaptionConfig;
  audioPreset: VideoProducerEditPlan["audioPreset"];
  colorPreset: VideoProducerEditPlan["colorPreset"];
  intro: boolean;
  outro: boolean;
  output: { format: "mp4"; width: 1920 | 1080; height: 1080 | 1920; fps: 30 };
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const finiteNumber = (value: number, fallback = 0) => Number.isFinite(value) ? value : fallback;

const SCRIPTURE_REFERENCE_PATTERN = /\b(?:Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|Ruth|(?:1|2)\s+Samuel|(?:1|2)\s+Kings|(?:1|2)\s+Chronicles|Ezra|Nehemiah|Esther|Job|Psalms?|Proverbs|Ecclesiastes|Song(?: of (?:Solomon|Songs))?|Isaiah|Jeremiah|Lamentations|Ezekiel|Daniel|Hosea|Joel|Amos|Obadiah|Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi|Matthew|Mark|Luke|John|Acts|Romans|(?:1|2)\s+Corinthians|Galatians|Ephesians|Philippians|Colossians|(?:1|2)\s+Thessalonians|(?:1|2)\s+Timothy|Titus|Philemon|Hebrews|James|(?:1|2)\s+Peter|(?:1|2|3)\s+John|Jude|Revelation)\s+\d{1,3}:\d{1,3}(?:-\d{1,3})?/i;

export function findVideoProducerScriptureReference(text: string): string | null {
  if (!text) return null;
  return text.match(SCRIPTURE_REFERENCE_PATTERN)?.[0] ?? null;
}

export const VIDEO_PRODUCER_MODE_DEFAULTS: Record<VideoProducerMode, {
  label: string;
  description: string;
  audioPreset: VideoProducerEditPlan["audioPreset"];
  colorPreset: VideoProducerEditPlan["colorPreset"];
  captions: VideoProducerCaptionConfig;
  intro: boolean;
  outro: boolean;
}> = {
  podcast: {
    label: "Podcast Mode",
    description: "Long-form editorial polish, structure, branded references, clean audio and a professional 16:9 master.",
    audioPreset: "ag-voice-clean",
    colorPreset: "ag-studio",
    captions: { enabled: false, style: "minimal", animation: "none", maxWordsPerCard: 8, position: "lower", highlightCurrentWord: false },
    intro: true,
    outro: true
  },
  reels: {
    label: "Reels Producer",
    description: "Vertical retention editing with animated captions, reframing, punch-ins, overlays and a social-ready 9:16 master.",
    audioPreset: "ag-voice-punch",
    colorPreset: "ag-clean",
    captions: { enabled: true, style: "kinetic-clean", animation: "highlight", maxWordsPerCard: 5, position: "lower", highlightCurrentWord: true },
    intro: false,
    outro: false
  }
};

export function buildDefaultVideoProducerPlan(mode: VideoProducerMode, sourceDuration: number, overlays: VideoProducerOverlay[] = []): VideoProducerEditPlan {
  const defaults = VIDEO_PRODUCER_MODE_DEFAULTS[mode];
  return {
    version: 2,
    mode,
    sourceDuration: Math.max(0, finiteNumber(sourceDuration)),
    cuts: [],
    overlays,
    motion: [],
    music: [],
    captions: { ...defaults.captions },
    audioPreset: defaults.audioPreset,
    colorPreset: defaults.colorPreset,
    intro: defaults.intro,
    outro: defaults.outro
  };
}

export function normalizeVideoProducerCuts(cuts: VideoProducerCut[], duration: number): VideoProducerCut[] {
  if (!Number.isFinite(duration) || duration <= 0) return [];
  const normalized = cuts
    .map((cut, index) => ({
      ...cut,
      id: cut.id || `cut-${index + 1}`,
      start: clamp(finiteNumber(Number(cut.start)), 0, duration),
      end: clamp(finiteNumber(Number(cut.end)), 0, duration)
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
  if (!Number.isFinite(duration) || duration <= 0) return [];
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
  if (!Number.isFinite(plan.sourceDuration) || plan.sourceDuration <= 0) return 0;
  const removed = normalizeVideoProducerCuts(plan.cuts, plan.sourceDuration)
    .reduce((sum, cut) => sum + cut.end - cut.start, 0);
  return Math.max(0, plan.sourceDuration - removed);
}

export function sourceTimeToOutputTime(sourceTime: number, cuts: VideoProducerCut[], duration: number): number | null {
  if (!Number.isFinite(sourceTime) || !Number.isFinite(duration) || duration <= 0) return null;
  const time = clamp(sourceTime, 0, duration);
  const normalized = normalizeVideoProducerCuts(cuts, duration);
  let removed = 0;
  for (const cut of normalized) {
    if (time >= cut.start && time < cut.end) return null;
    if (cut.end <= time) removed += cut.end - cut.start;
  }
  return time - removed;
}

export function mapSourceRangeToOutputRanges(start: number, end: number, cuts: VideoProducerCut[], duration: number): VideoProducerOutputRange[] {
  if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(duration) || duration <= 0) return [];
  const safeStart = clamp(start, 0, duration);
  const safeEnd = clamp(end, 0, duration);
  if (safeEnd <= safeStart) return [];

  const keepSegments = buildKeepSegments(cuts, duration);
  const ranges: VideoProducerOutputRange[] = [];
  let outputCursor = 0;

  for (const keep of keepSegments) {
    const overlapStart = Math.max(safeStart, keep.start);
    const overlapEnd = Math.min(safeEnd, keep.end);
    if (overlapEnd > overlapStart) {
      ranges.push({
        sourceStart: overlapStart,
        sourceEnd: overlapEnd,
        outputStart: outputCursor + (overlapStart - keep.start),
        outputEnd: outputCursor + (overlapEnd - keep.start)
      });
    }
    outputCursor += keep.end - keep.start;
  }

  return ranges;
}

export function sanitizeVideoProducerTransform(transform: VideoProducerMotionTransform): VideoProducerMotionTransform {
  return {
    focusX: clamp(finiteNumber(transform.focusX, 0.5), 0, 1),
    focusY: clamp(finiteNumber(transform.focusY, 0.5), 0, 1),
    scale: clamp(finiteNumber(transform.scale, 1), 1, 2.5)
  };
}

export function compileVideoProducerRenderPlan(plan: VideoProducerEditPlan): VideoProducerRenderPlan {
  const sourceDuration = Math.max(0, finiteNumber(plan.sourceDuration));
  const cuts = normalizeVideoProducerCuts(plan.cuts, sourceDuration);
  const output = plan.mode === "reels"
    ? { format: "mp4" as const, width: 1080 as const, height: 1920 as const, fps: 30 as const }
    : { format: "mp4" as const, width: 1920 as const, height: 1080 as const, fps: 30 as const };

  return {
    version: 2,
    mode: plan.mode,
    sourceDuration,
    outputDuration: outputDurationForPlan({ sourceDuration, cuts }),
    keepSegments: buildKeepSegments(cuts, sourceDuration),
    overlays: plan.overlays.map((overlay) => ({
      ...overlay,
      outputStart: sourceTimeToOutputTime(overlay.start, cuts, sourceDuration),
      outputRanges: mapSourceRangeToOutputRanges(overlay.start, overlay.start + Math.max(0, finiteNumber(overlay.duration)), cuts, sourceDuration)
    })),
    motion: plan.motion.map((cue) => ({
      ...cue,
      transform: cue.transform ? sanitizeVideoProducerTransform(cue.transform) : undefined,
      outputStart: sourceTimeToOutputTime(cue.start, cuts, sourceDuration),
      outputRanges: mapSourceRangeToOutputRanges(cue.start, cue.start + Math.max(0, finiteNumber(cue.duration)), cuts, sourceDuration)
    })),
    music: plan.music.map((cue) => ({
      ...cue,
      outputRanges: mapSourceRangeToOutputRanges(cue.start, cue.end, cuts, sourceDuration)
    })),
    captions: { ...plan.captions },
    audioPreset: plan.audioPreset,
    colorPreset: plan.colorPreset,
    intro: plan.intro,
    outro: plan.outro,
    output
  };
}

export function formatProducerTime(seconds: number) {
  const safe = Math.max(0, Math.floor(finiteNumber(seconds)));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}
