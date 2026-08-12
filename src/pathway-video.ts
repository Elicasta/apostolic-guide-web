export type PathwayVideoFormat = "youtube" | "vertical" | "square";

export type PathwayVideoCueKind = "brand" | "scripture" | "statement" | "cta";

export type PathwayVideoCue = {
  id: string;
  start: number;
  kind: PathwayVideoCueKind;
  eyebrow: string;
  title: string;
  body: string;
  reference: string;
};

export type PathwayVideoStep = {
  title: string;
  reference: string;
  explanation: string;
};

export type PathwayVideoTimelineSource = {
  slug: string;
  title: string;
  summary: string;
  steps: PathwayVideoStep[];
};

export const VIDEO_FORMATS: Record<PathwayVideoFormat, { label: string; width: number; height: number; purpose: string }> = {
  youtube: { label: "YouTube", width: 1920, height: 1080, purpose: "Full Pathway episode · 16:9" },
  vertical: { label: "Reel / TikTok", width: 1080, height: 1920, purpose: "Vertical social video · 9:16" },
  square: { label: "Square", width: 1080, height: 1080, purpose: "Flexible social cut · 1:1" }
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function cueId(slug: string, index: number) {
  return `${slug}-${String(index).padStart(2, "0")}`;
}

export function buildEstimatedPathwayVideoTimeline(source: PathwayVideoTimelineSource, duration: number): PathwayVideoCue[] {
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : Math.max(30, source.steps.length * 30 + 18);
  const introLength = clamp(safeDuration * 0.045, 7, 13);
  const outroLength = clamp(safeDuration * 0.035, 6, 10);
  const contentStart = introLength;
  const contentEnd = Math.max(contentStart + 1, safeDuration - outroLength);
  const contentLength = contentEnd - contentStart;
  const stepCount = Math.max(1, source.steps.length);

  const cues: PathwayVideoCue[] = [{
    id: cueId(source.slug, 0),
    start: 0,
    kind: "brand",
    eyebrow: "APOSTOLIC GUIDE · PATHWAY",
    title: source.title.toUpperCase(),
    body: source.summary,
    reference: source.title.toUpperCase()
  }];

  source.steps.forEach((step, index) => {
    const start = contentStart + (contentLength * index) / stepCount;
    cues.push({
      id: cueId(source.slug, index + 1),
      start: Number(start.toFixed(2)),
      kind: "scripture",
      eyebrow: step.reference.toUpperCase(),
      title: step.title.toUpperCase(),
      body: step.explanation,
      reference: step.reference.toUpperCase()
    });
  });

  cues.push({
    id: cueId(source.slug, source.steps.length + 1),
    start: Number(contentEnd.toFixed(2)),
    kind: "cta",
    eyebrow: "PATHWAY COMPLETE",
    title: "CONTINUE STUDYING",
    body: `Continue the ${source.title} Pathway at ApostolicGuide.com`,
    reference: "APOSTOLIC GUIDE"
  });

  return cues;
}

export function normalizePathwayVideoTimeline(cues: PathwayVideoCue[], duration: number) {
  const max = Number.isFinite(duration) && duration > 0 ? duration : Number.MAX_SAFE_INTEGER;
  return cues
    .map((cue) => ({
      ...cue,
      start: Number(clamp(Number(cue.start) || 0, 0, max).toFixed(2)),
      eyebrow: cue.eyebrow.trim().slice(0, 120),
      title: cue.title.trim().slice(0, 220),
      body: cue.body.trim().slice(0, 500),
      reference: cue.reference.trim().slice(0, 120)
    }))
    .sort((a, b) => a.start - b.start)
    .map((cue, index) => ({ ...cue, id: cue.id || `cue-${index + 1}` }));
}

export function activePathwayVideoCue(cues: PathwayVideoCue[], time: number) {
  if (!cues.length) return null;
  let active = cues[0];
  for (const cue of cues) {
    if (cue.start <= time) active = cue;
    else break;
  }
  return active;
}

export function formatVideoTimestamp(seconds: number) {
  const safe = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor(safe / 60);
  const remaining = safe % 60;
  return `${minutes}:${String(remaining).padStart(2, "0")}`;
}
