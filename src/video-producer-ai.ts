import { z } from "zod";
import {
  buildDefaultVideoProducerPlan,
  normalizeVideoProducerCuts,
  sanitizeVideoProducerTransform,
  type VideoProducerEditPlan,
  type VideoProducerMode,
  type VideoProducerMotionCue,
  type VideoProducerOverlay
} from "./video-producer";

export type VideoProducerTranscriptWord = { word: string; start: number; end: number };
export type VideoProducerTranscriptSegment = { text: string; start: number; end: number };
export type VideoProducerTranscript = {
  text: string;
  duration: number;
  words: VideoProducerTranscriptWord[];
  segments: VideoProducerTranscriptSegment[];
};

export type VideoProducerReelCandidate = {
  id: string;
  start: number;
  end: number;
  hook: string;
  title: string;
  score: number;
  reason: string;
};

const overlayKind = z.enum(["scripture", "pathway", "lower-third", "chapter", "statement", "kinetic", "quote", "cta"]);
const overlayAnimation = z.enum(["fade", "rise", "slide", "pop", "wipe", "none"]);
const overlayPlacement = z.enum(["top", "center", "lower-third", "full-frame"]);
const kineticTreatment = z.enum(["impact", "split", "strike", "band", "stack", "question-stack"]);
const motionKind = z.enum(["punch-in", "reframe", "emphasis", "b-roll"]);
const intensity = z.enum(["subtle", "medium", "strong"]);

const directorSchema = z.object({
  summary: z.string().max(800).default(""),
  cuts: z.array(z.object({
    start: z.number(),
    end: z.number(),
    reason: z.string().max(300).default("")
  })).max(120).default([]),
  overlays: z.array(z.object({
    kind: overlayKind,
    start: z.number(),
    duration: z.number(),
    title: z.string().min(1).max(120),
    body: z.string().max(320).nullable().optional(),
    reference: z.string().max(80).nullable().optional(),
    animation: overlayAnimation.nullable().optional(),
    placement: overlayPlacement.nullable().optional(),
    treatment: kineticTreatment.nullable().optional()
  })).max(80).default([]),
  motion: z.array(z.object({
    kind: motionKind,
    start: z.number(),
    duration: z.number(),
    intensity: intensity.nullable().optional(),
    focusX: z.number().nullable().optional(),
    focusY: z.number().nullable().optional(),
    scale: z.number().nullable().optional(),
    note: z.string().max(240).nullable().optional()
  })).max(160).default([])
});

const candidateSchema = z.object({
  candidates: z.array(z.object({
    start: z.number(),
    end: z.number(),
    hook: z.string().min(1).max(180),
    title: z.string().min(1).max(120),
    score: z.number().min(0).max(100),
    reason: z.string().min(1).max(360)
  })).min(1).max(15)
});

export const VIDEO_PRODUCER_DIRECTOR_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "cuts", "overlays", "motion"],
  properties: {
    summary: { type: "string" },
    cuts: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["start", "end", "reason"],
        properties: { start: { type: "number" }, end: { type: "number" }, reason: { type: "string" } }
      }
    },
    overlays: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["kind", "start", "duration", "title", "body", "reference", "animation", "placement", "treatment"],
        properties: {
          kind: { type: "string", enum: overlayKind.options },
          start: { type: "number" }, duration: { type: "number" }, title: { type: "string" },
          body: { type: ["string", "null"] }, reference: { type: ["string", "null"] },
          animation: { type: ["string", "null"], enum: [...overlayAnimation.options, null] },
          placement: { type: ["string", "null"], enum: [...overlayPlacement.options, null] },
          treatment: { type: ["string", "null"], enum: [...kineticTreatment.options, null] }
        }
      }
    },
    motion: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["kind", "start", "duration", "intensity", "focusX", "focusY", "scale", "note"],
        properties: {
          kind: { type: "string", enum: motionKind.options }, start: { type: "number" }, duration: { type: "number" },
          intensity: { type: ["string", "null"], enum: [...intensity.options, null] },
          focusX: { type: ["number", "null"] }, focusY: { type: ["number", "null"] }, scale: { type: ["number", "null"] },
          note: { type: ["string", "null"] }
        }
      }
    }
  }
} as const;

export const VIDEO_PRODUCER_CANDIDATES_JSON_SCHEMA = {
  type: "object", additionalProperties: false, required: ["candidates"],
  properties: {
    candidates: {
      type: "array", minItems: 5, maxItems: 15,
      items: {
        type: "object", additionalProperties: false,
        required: ["start", "end", "hook", "title", "score", "reason"],
        properties: {
          start: { type: "number" }, end: { type: "number" }, hook: { type: "string" }, title: { type: "string" },
          score: { type: "number", minimum: 0, maximum: 100 }, reason: { type: "string" }
        }
      }
    }
  }
} as const;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function nullableString(value: string | null | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function normalizeVideoProducerTranscript(value: unknown): VideoProducerTranscript {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const words = Array.isArray(raw.words) ? raw.words.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const word = item as Record<string, unknown>;
    if (typeof word.word !== "string" || typeof word.start !== "number" || typeof word.end !== "number" || word.end <= word.start) return [];
    return [{ word: word.word, start: Math.max(0, word.start), end: Math.max(0, word.end) }];
  }) : [];
  const segments = Array.isArray(raw.segments) ? raw.segments.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const segment = item as Record<string, unknown>;
    if (typeof segment.text !== "string" || typeof segment.start !== "number" || typeof segment.end !== "number" || segment.end <= segment.start) return [];
    return [{ text: segment.text, start: Math.max(0, segment.start), end: Math.max(0, segment.end) }];
  }) : [];
  const duration = typeof raw.duration === "number" && raw.duration > 0
    ? raw.duration
    : Math.max(words.at(-1)?.end ?? 0, segments.at(-1)?.end ?? 0);
  const text = typeof raw.text === "string" ? raw.text.trim() : segments.map((segment) => segment.text).join(" ").trim();
  return { text, duration, words, segments };
}

export function sliceVideoProducerTranscript(transcript: VideoProducerTranscript, start: number, end: number): VideoProducerTranscript {
  const safeStart = clamp(start, 0, transcript.duration);
  const safeEnd = clamp(end, safeStart, transcript.duration);
  if (safeEnd <= safeStart) return { text: "", duration: 0, words: [], segments: [] };
  const words = transcript.words.flatMap((word) => {
    if (word.end <= safeStart || word.start >= safeEnd) return [];
    return [{ word: word.word, start: Math.max(0, word.start - safeStart), end: Math.min(safeEnd - safeStart, word.end - safeStart) }];
  });
  const segments = transcript.segments.flatMap((segment) => {
    if (segment.end <= safeStart || segment.start >= safeEnd) return [];
    return [{
      text: segment.text,
      start: Math.max(0, segment.start - safeStart),
      end: Math.min(safeEnd - safeStart, segment.end - safeStart)
    }];
  });
  return {
    text: segments.length ? segments.map((segment) => segment.text).join(" ").trim() : words.map((word) => word.word).join(" ").trim(),
    duration: safeEnd - safeStart,
    words,
    segments
  };
}

export function normalizeVideoProducerDirectorOutput(input: unknown, mode: VideoProducerMode, duration: number): { plan: VideoProducerEditPlan; summary: string } {
  const parsed = directorSchema.parse(input);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("A valid source duration is required.");

  const cuts = normalizeVideoProducerCuts(parsed.cuts.map((cut, index) => ({
    id: `ai-cut-${index + 1}`, start: cut.start, end: cut.end, reason: cut.reason.trim() || undefined
  })), duration);
  const removed = cuts.reduce((sum, cut) => sum + cut.end - cut.start, 0);
  const maxRemovedRatio = mode === "podcast" ? 0.35 : 0.8;
  if (removed / duration > maxRemovedRatio) throw new Error(`Director proposed removing more than ${Math.round(maxRemovedRatio * 100)}% of the source.`);

  const overlays: VideoProducerOverlay[] = parsed.overlays.flatMap((cue, index) => {
    const start = clamp(cue.start, 0, duration);
    const cueDuration = clamp(cue.duration, 0.5, mode === "podcast" ? 15 : 8);
    if (start >= duration) return [];
    return [{
      id: `ai-overlay-${index + 1}`, kind: cue.kind, start, duration: Math.min(cueDuration, duration - start), title: cue.title.trim(),
      body: nullableString(cue.body), reference: nullableString(cue.reference),
      animation: cue.animation ?? (mode === "reels" ? "rise" : "fade"),
      placement: cue.kind === "kinetic" ? "full-frame" : cue.placement ?? (mode === "reels" ? "center" : "lower-third"),
      treatment: cue.kind === "kinetic" ? (cue.treatment ?? "impact") : undefined
    }];
  });

  const motion: VideoProducerMotionCue[] = parsed.motion.flatMap((cue, index) => {
    const start = clamp(cue.start, 0, duration);
    if (start >= duration) return [];
    const hasTransform = cue.focusX != null || cue.focusY != null || cue.scale != null;
    return [{
      id: `ai-motion-${index + 1}`, kind: cue.kind, start, duration: Math.min(clamp(cue.duration, 0.25, 12), duration - start),
      intensity: cue.intensity ?? undefined, note: nullableString(cue.note),
      transform: hasTransform ? sanitizeVideoProducerTransform({ focusX: cue.focusX ?? 0.5, focusY: cue.focusY ?? 0.5, scale: cue.scale ?? 1 }) : undefined
    }];
  });

  const plan = buildDefaultVideoProducerPlan(mode, duration, overlays);
  plan.cuts = cuts;
  plan.motion = mode === "reels" ? motion : motion.filter((cue) => cue.kind !== "reframe" || cue.intensity !== "strong");
  return { plan, summary: parsed.summary.trim() };
}

export function normalizeVideoProducerReelCandidates(input: unknown, duration: number): VideoProducerReelCandidate[] {
  const parsed = candidateSchema.parse(input);
  const candidates = parsed.candidates.flatMap((candidate, index) => {
    const start = clamp(candidate.start, 0, duration);
    const end = clamp(candidate.end, 0, duration);
    const length = end - start;
    if (length < 12 || length > 150) return [];
    return [{
      id: `reel-${index + 1}`, start, end, hook: candidate.hook.trim(), title: candidate.title.trim(),
      score: Math.round(clamp(candidate.score, 0, 100)), reason: candidate.reason.trim()
    }];
  });
  const deduped: VideoProducerReelCandidate[] = [];
  for (const candidate of candidates.sort((a, b) => b.score - a.score || a.start - b.start)) {
    const overlaps = deduped.some((existing) => Math.max(existing.start, candidate.start) < Math.min(existing.end, candidate.end) - 5);
    if (!overlaps) deduped.push(candidate);
    if (deduped.length === 15) break;
  }
  return deduped;
}

export function transcriptForModel(transcript: VideoProducerTranscript, maxChars = 120000) {
  const lines = transcript.segments.length
    ? transcript.segments.map((segment) => `[${segment.start.toFixed(2)}-${segment.end.toFixed(2)}] ${segment.text}`)
    : transcript.words.map((word) => `[${word.start.toFixed(2)}] ${word.word}`);
  return lines.join("\n").slice(0, maxChars);
}
