import {
  buildEstimatedPathwayVideoTimeline,
  normalizePathwayVideoTimeline,
  type PathwayVideoCue,
  type PathwayVideoTimelineSource
} from "./pathway-video";

export const APOSTOLIC_MOTION_ENGINE_VERSION = 1 as const;
export const APOSTOLIC_MOTION_STYLE = "ag-illustrated-whiteboard-v1" as const;

export type ApostolicMotionVisual =
  | "opening-question"
  | "brand-reveal"
  | "shema"
  | "no-rival"
  | "jesus-shema"
  | "true-god"
  | "apostolic-witness"
  | "one-mediator"
  | "belief"
  | "creator"
  | "word-flesh"
  | "invisible-visible"
  | "water-name"
  | "spirit-fire"
  | "authority"
  | "gospel-pattern"
  | "scripture-scroll"
  | "recap-map"
  | "cta";

export type ApostolicMotionCamera = "hold" | "push" | "pan-left" | "pan-right" | "pull";
export type ApostolicMotionVariant = "primary" | "emphasis" | "transition";

export type ApostolicMotionScene = {
  id: string;
  cueId: string;
  start: number;
  end: number;
  visual: ApostolicMotionVisual;
  camera: ApostolicMotionCamera;
  variant: ApostolicMotionVariant;
  eyebrow: string;
  headline: string;
  body: string;
  reference: string;
  chapter: number;
};

export type ApostolicMotionPlan = {
  version: typeof APOSTOLIC_MOTION_ENGINE_VERSION;
  style: typeof APOSTOLIC_MOTION_STYLE;
  composition: "continuous-canvas";
  slug: string;
  title: string;
  duration: number;
  pilotWindowSeconds: number;
  palette: {
    background: string;
    ink: string;
    muted: string;
    red: string;
    blue: string;
  };
  scenes: ApostolicMotionScene[];
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizedText(cue: PathwayVideoCue) {
  return `${cue.reference} ${cue.eyebrow} ${cue.title} ${cue.body}`.toLocaleLowerCase();
}

function visualForCue(cue: PathwayVideoCue): ApostolicMotionVisual {
  if (cue.kind === "question") return "opening-question";
  if (cue.kind === "brand") return "brand-reveal";
  if (cue.kind === "recap") return "recap-map";
  if (cue.kind === "cta") return "cta";

  const value = normalizedText(cue);
  if (/mark\s+12:29/.test(value)) return "jesus-shema";
  if (/deuteronomy\s+6:4|hear,?\s+o\s+israel|one\s+lord/.test(value)) return "shema";
  if (/isaiah\s+4[3-6]|no\s+god\s+beside|none\s+else|no\s+other\s+god|there\s+is\s+no\s+god/.test(value)) return "no-rival";
  if (/john\s+17:3|only\s+true\s+god|true\s+god/.test(value)) return "true-god";
  if (/1\s+corinthians\s+8|one\s+god.*one\s+lord|one\s+lord.*one\s+god/.test(value)) return "apostolic-witness";
  if (/galatians\s+3:20|mediator/.test(value)) return "one-mediator";
  if (/james\s+2:19|devils|demons|believ/.test(value)) return "belief";
  if (/john\s+1:14|word\s+became\s+flesh|word\s+was\s+made\s+flesh|made\s+flesh/.test(value)) return "word-flesh";
  if (/image\s+of\s+god|image\s+of\s+the\s+invisible|colossians\s+1:15|hebrews\s+1:3/.test(value)) return "invisible-visible";
  if (/creator|creation|created\s+all|genesis\s+1|isaiah\s+44:24/.test(value)) return "creator";
  if (/baptis|acts\s+2:38|acts\s+8:16|acts\s+10:48|acts\s+19:5|jesus'?\s+name/.test(value)) return "water-name";
  if (/holy\s+ghost|holy\s+spirit|tongues|acts\s+2:4|spirit\s+filled/.test(value)) return "spirit-fire";
  if (/right\s+hand|authority|throne|exalted/.test(value)) return "authority";
  if (/death.*burial.*resurrection|repentance.*baptism|gospel\s+pattern|resurrection/.test(value)) return "gospel-pattern";
  return "scripture-scroll";
}

function cameraForScene(visual: ApostolicMotionVisual, cue: PathwayVideoCue, index: number): ApostolicMotionCamera {
  if (cue.kind === "question") return "push";
  if (cue.kind === "brand") return "pull";
  if (cue.kind === "recap") return "pull";
  if (cue.kind === "cta") return "hold";
  if (cue.kind === "statement") return "push";
  if (["word-flesh", "gospel-pattern", "apostolic-witness"].includes(visual)) return index % 2 ? "pan-left" : "pan-right";
  return (["pan-right", "push", "pan-left", "hold"] as ApostolicMotionCamera[])[index % 4];
}

function variantForCue(cue: PathwayVideoCue): ApostolicMotionVariant {
  if (cue.kind === "statement") return "emphasis";
  if (cue.kind === "brand" || cue.kind === "cta") return "transition";
  return "primary";
}

export function buildApostolicMotionPlan(
  source: PathwayVideoTimelineSource,
  timeline: PathwayVideoCue[],
  duration: number
): ApostolicMotionPlan {
  const safeDuration = Number.isFinite(duration) && duration > 0
    ? duration
    : Math.max(60, source.steps.length * 36 + 24);
  const sourceTimeline = timeline.length
    ? timeline
    : buildEstimatedPathwayVideoTimeline(source, safeDuration);
  const cues = normalizePathwayVideoTimeline(sourceTimeline, safeDuration);

  const scenes = cues.map((cue, index) => {
    const nextStart = cues[index + 1]?.start ?? safeDuration;
    const start = clamp(cue.start, 0, safeDuration);
    const end = clamp(Math.max(start + 0.35, nextStart), start + 0.35, safeDuration);
    const visual = visualForCue(cue);
    return {
      id: `motion-${cue.id}`,
      cueId: cue.id,
      start: Number(start.toFixed(2)),
      end: Number(end.toFixed(2)),
      visual,
      camera: cameraForScene(visual, cue, index),
      variant: variantForCue(cue),
      eyebrow: cue.eyebrow,
      headline: cue.title,
      body: cue.body,
      reference: cue.reference,
      chapter: index + 1
    } satisfies ApostolicMotionScene;
  });

  return {
    version: APOSTOLIC_MOTION_ENGINE_VERSION,
    style: APOSTOLIC_MOTION_STYLE,
    composition: "continuous-canvas",
    slug: source.slug,
    title: source.title,
    duration: Number(safeDuration.toFixed(2)),
    pilotWindowSeconds: Number(Math.min(90, safeDuration).toFixed(2)),
    palette: {
      background: "#08131d",
      ink: "#f3efe7",
      muted: "#9da8b1",
      red: "#a62b3d",
      blue: "#537ba4"
    },
    scenes
  };
}

export function activeApostolicMotionScene(plan: ApostolicMotionPlan, time: number) {
  if (!plan.scenes.length) return null;
  const safeTime = clamp(Number(time) || 0, 0, plan.duration);
  let active = plan.scenes[0];
  for (const scene of plan.scenes) {
    if (scene.start <= safeTime) active = scene;
    else break;
  }
  return active;
}

export function apostolicMotionSceneProgress(scene: ApostolicMotionScene | null, time: number) {
  if (!scene) return 0;
  const length = Math.max(0.1, scene.end - scene.start);
  return clamp(((Number(time) || 0) - scene.start) / length, 0, 1);
}

export function apostolicMotionEngineStyle(plan: ApostolicMotionPlan) {
  return {
    version: plan.version,
    style: plan.style,
    composition: plan.composition,
    pilotWindowSeconds: plan.pilotWindowSeconds,
    plan
  };
}

export function apostolicMotionPlanFromStyle(style: unknown): ApostolicMotionPlan | null {
  if (!style || typeof style !== "object") return null;
  const motion = (style as Record<string, unknown>).motionEngine;
  if (!motion || typeof motion !== "object") return null;
  const plan = (motion as Record<string, unknown>).plan;
  if (!plan || typeof plan !== "object") return null;
  const candidate = plan as Partial<ApostolicMotionPlan>;
  if (candidate.version !== APOSTOLIC_MOTION_ENGINE_VERSION || candidate.style !== APOSTOLIC_MOTION_STYLE || !Array.isArray(candidate.scenes)) return null;
  return candidate as ApostolicMotionPlan;
}

export function apostolicMotionVisualLabel(visual: ApostolicMotionVisual) {
  return visual.split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}
