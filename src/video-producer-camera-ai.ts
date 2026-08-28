import { z } from "zod";
import type { VideoProducerTranscript } from "./video-producer-ai";
import {
  normalizeVideoProducerCameraPlan,
  preserveLockedCameraDecisions,
  type VideoProducerCameraDecision,
  type VideoProducerCameraPlan,
  type VideoProducerCoverage
} from "./video-producer-multicam";

const cameraDecisionSchema = z.object({
  at: z.number(),
  camera: z.enum(["A", "B"]),
  reason: z.string().max(280).default("")
});

const cameraDirectorSchema = z.object({
  summary: z.string().max(500).default(""),
  decisions: z.array(cameraDecisionSchema).max(80).default([])
});

export const VIDEO_PRODUCER_CAMERA_DIRECTOR_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "decisions"],
  properties: {
    summary: { type: "string" },
    decisions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["at", "camera", "reason"],
        properties: {
          at: { type: "number" },
          camera: { type: "string", enum: ["A", "B"] },
          reason: { type: "string" }
        }
      }
    }
  }
} as const;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function cameraBoundaries(transcript: VideoProducerTranscript, duration: number) {
  const values = new Set<number>([0, duration]);
  for (const segment of transcript.segments) {
    if (segment.start > 0.1 && segment.start < duration - 0.1) values.add(segment.start);
    if (segment.end > 0.1 && segment.end < duration - 0.1) values.add(segment.end);
  }
  // Word timing gives us a safe fallback when the transcription service returns
  // very broad segments. Prefer punctuation-like gaps rather than arbitrary words.
  for (let index = 1; index < transcript.words.length; index += 1) {
    const previous = transcript.words[index - 1];
    const next = transcript.words[index];
    if (next.start - previous.end >= 0.22 && previous.end > 0.1 && previous.end < duration - 0.1) values.add(previous.end);
  }
  return [...values].sort((a, b) => a - b);
}

function snapToBoundary(at: number, boundaries: number[], maxDistance = 1.1) {
  let best = at;
  let distance = maxDistance + 0.001;
  for (const boundary of boundaries) {
    const nextDistance = Math.abs(boundary - at);
    if (nextDistance < distance) {
      distance = nextDistance;
      best = boundary;
    }
  }
  return distance <= maxDistance ? best : at;
}

function bShare(plan: VideoProducerCameraPlan, duration: number) {
  const normalized = normalizeVideoProducerCameraPlan(plan, duration, { start: 0, end: duration });
  let cursor = 0;
  let camera: "A" | "B" = "A";
  let total = 0;
  for (const decision of normalized.decisions) {
    if (camera === "B") total += Math.max(0, decision.at - cursor);
    cursor = decision.at;
    camera = decision.camera;
  }
  if (camera === "B") total += Math.max(0, duration - cursor);
  return duration > 0 ? total / duration : 0;
}

export function normalizeVideoProducerCameraDirectorOutput(input: unknown, options: {
  duration: number;
  transcript: VideoProducerTranscript;
  coverage: VideoProducerCoverage;
  existingPlan?: VideoProducerCameraPlan | null;
  mode: "podcast" | "reels";
}) {
  const parsed = cameraDirectorSchema.parse(input);
  const duration = Math.max(0, options.duration);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("A valid project duration is required for Smart Auto Cut.");
  const boundaries = cameraBoundaries(options.transcript, duration);
  const minShot = options.mode === "reels" ? 2.4 : 4.0;
  const maxBShare = options.mode === "reels" ? 0.45 : 0.35;

  const snapped: VideoProducerCameraDecision[] = parsed.decisions.map((decision, index): VideoProducerCameraDecision => ({
    id: `auto-camera-${index + 1}`,
    at: clamp(snapToBoundary(decision.at, boundaries), 0, duration),
    camera: decision.camera,
    reason: decision.reason.trim() || undefined,
    source: "auto",
    locked: false
  })).sort((a, b) => a.at - b.at);

  // Stabilize generated decisions before camera-plan normalization. Two model cuts
  // can snap onto the same phrase boundary; if the second one is allowed to replace
  // the first, a valid A→B→A beat can collapse into no visible B shot at all.
  const proposed: VideoProducerCameraDecision[] = [];
  let generatedCamera: "A" | "B" = "A";
  let generatedLastAt = 0;
  for (const decision of snapped) {
    if (decision.camera === generatedCamera) continue;
    if (decision.at - generatedLastAt < minShot) continue;
    proposed.push(decision);
    generatedCamera = decision.camera;
    generatedLastAt = decision.at;
  }

  const preserved = preserveLockedCameraDecisions(proposed, options.existingPlan);
  let plan = normalizeVideoProducerCameraPlan({ version: 1, defaultCamera: "A", decisions: preserved }, duration, options.coverage);

  // Enforce minimum shot duration again after locked human decisions are merged.
  // Locked manual decisions win over generated spacing.
  const spaced: VideoProducerCameraDecision[] = [];
  let lastAt = 0;
  for (const decision of plan.decisions) {
    if (!decision.locked && decision.at - lastAt < minShot) continue;
    spaced.push(decision);
    lastAt = decision.at;
  }
  plan = normalizeVideoProducerCameraPlan({ version: 1, defaultCamera: "A", decisions: spaced }, duration, options.coverage);

  // Camera A remains the authority angle. Remove unlocked B intervals from the
  // end until the generated plan respects the editorial B-share ceiling.
  if (bShare(plan, duration) > maxBShare) {
    const decisions = [...plan.decisions];
    for (let index = decisions.length - 1; index >= 0 && bShare({ ...plan, decisions }, duration) > maxBShare; index -= 1) {
      const decision = decisions[index];
      if (decision.locked || decision.camera !== "B") continue;
      decisions.splice(index, 1);
    }
    plan = normalizeVideoProducerCameraPlan({ version: 1, defaultCamera: "A", decisions }, duration, options.coverage);
  }

  return {
    plan: { ...plan, generatedAt: new Date().toISOString() },
    summary: parsed.summary.trim()
  };
}
