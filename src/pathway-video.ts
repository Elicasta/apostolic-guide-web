export type PathwayVideoFormat = "youtube" | "vertical" | "square";

export type PathwayVideoCueKind = "question" | "brand" | "scripture" | "statement" | "recap" | "cta";

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

export type PathwayVideoChapter = {
  start: number;
  label: string;
  reference: string;
  cueId: string;
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

function firstSentence(value: string) {
  const match = value.trim().match(/^(.+?[?.!])(?:\s|$)/);
  return (match?.[1] ?? value.trim()).slice(0, 180);
}

function condensedExplanation(value: string) {
  return firstSentence(value).replace(/^["“]|["”]$/g, "").slice(0, 220);
}

export function buildEstimatedPathwayVideoTimeline(source: PathwayVideoTimelineSource, duration: number): PathwayVideoCue[] {
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : Math.max(60, source.steps.length * 36 + 24);
  const questionEnd = clamp(safeDuration * 0.024, 5.5, 8.5);
  const introEnd = clamp(safeDuration * 0.052, 12, 17);
  const outroLength = clamp(safeDuration * 0.026, 6, 9);
  const recapLength = clamp(safeDuration * 0.072, 14, 23);
  const contentStart = introEnd;
  const contentEnd = Math.max(contentStart + 4, safeDuration - outroLength - recapLength);
  const sectionLength = (contentEnd - contentStart) / Math.max(1, source.steps.length);
  const cues: PathwayVideoCue[] = [];

  cues.push({
    id: cueId(source.slug, 0),
    start: 0,
    kind: "question",
    eyebrow: `${source.title.toUpperCase()} · PATHWAY`,
    title: `WHAT DOES SCRIPTURE REVEAL?`,
    body: source.summary,
    reference: source.title.toUpperCase()
  });

  cues.push({
    id: cueId(source.slug, 1),
    start: Number(questionEnd.toFixed(2)),
    kind: "brand",
    eyebrow: "APOSTOLIC GUIDE",
    title: source.title.toUpperCase(),
    body: "Follow the Pathway as we move through the Scriptures together.",
    reference: source.title.toUpperCase()
  });

  source.steps.forEach((step, index) => {
    const sectionStart = contentStart + sectionLength * index;
    const statementStart = sectionStart + sectionLength * 0.54;
    cues.push({
      id: cueId(source.slug, cues.length),
      start: Number(sectionStart.toFixed(2)),
      kind: "scripture",
      eyebrow: step.reference.toUpperCase(),
      title: step.title.toUpperCase(),
      body: condensedExplanation(step.explanation),
      reference: step.reference.toUpperCase()
    });
    cues.push({
      id: cueId(source.slug, cues.length),
      start: Number(statementStart.toFixed(2)),
      kind: "statement",
      eyebrow: step.reference.toUpperCase(),
      title: step.title.toUpperCase(),
      body: condensedExplanation(step.explanation),
      reference: step.reference.toUpperCase()
    });
  });

  const recapStart = Math.max(contentEnd, safeDuration - outroLength - recapLength);
  cues.push({
    id: cueId(source.slug, cues.length),
    start: Number(recapStart.toFixed(2)),
    kind: "recap",
    eyebrow: "THE PATHWAY",
    title: source.title.toUpperCase(),
    body: source.steps.map((step) => step.title.toUpperCase()).join(" · ").slice(0, 500),
    reference: source.title.toUpperCase()
  });

  const witnessStart = Math.min(safeDuration - outroLength - 4, recapStart + recapLength * 0.55);
  if (witnessStart > recapStart + 4) {
    cues.push({
      id: cueId(source.slug, cues.length),
      start: Number(witnessStart.toFixed(2)),
      kind: "statement",
      eyebrow: "THE SCRIPTURAL WITNESS",
      title: source.title.toUpperCase(),
      body: source.summary,
      reference: source.title.toUpperCase()
    });
  }

  cues.push({
    id: cueId(source.slug, cues.length),
    start: Number((safeDuration - outroLength).toFixed(2)),
    kind: "cta",
    eyebrow: "PATHWAY COMPLETE",
    title: "CONTINUE STUDYING",
    body: `Continue the ${source.title} Pathway at ApostolicGuide.com`,
    reference: "APOSTOLIC GUIDE"
  });

  return normalizePathwayVideoTimeline(cues, safeDuration);
}

export function buildPathwayVideoChapters(cues: PathwayVideoCue[], sourceTitle: string): PathwayVideoChapter[] {
  const ordered = normalizePathwayVideoTimeline(cues, Number.MAX_SAFE_INTEGER);
  const chapters: PathwayVideoChapter[] = [{
    start: 0,
    label: "INTRO",
    reference: sourceTitle.toUpperCase(),
    cueId: ordered[0]?.id ?? "intro"
  }];

  for (const cue of ordered) {
    if (cue.kind !== "scripture") continue;
    chapters.push({
      start: cue.start,
      label: cue.title || cue.reference || "SCRIPTURE",
      reference: cue.reference || cue.eyebrow,
      cueId: cue.id
    });
  }

  const cta = ordered.find((cue) => cue.kind === "cta");
  if (cta) chapters.push({ start: cta.start, label: "COMPLETE", reference: "APOSTOLIC GUIDE", cueId: cta.id });
  return chapters;
}

export function activePathwayVideoChapter(chapters: PathwayVideoChapter[], time: number) {
  if (!chapters.length) return null;
  let active = chapters[0];
  for (const chapter of chapters) {
    if (chapter.start <= time) active = chapter;
    else break;
  }
  return active;
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
