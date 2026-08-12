import type { DirectedPathwayVideoCue } from "./pathway-video-director";
import {
  buildEstimatedPathwayVideoTimeline,
  normalizePathwayVideoTimeline,
  type PathwayVideoCue,
  type PathwayVideoTimelineSource
} from "./pathway-video";

export type TimedTranscriptWord = {
  word: string;
  start: number;
  end: number;
};

export type PathwayVideoAlignment = {
  timeline: PathwayVideoCue[];
  matchedScriptureCues: number;
  totalScriptureCues: number;
  matchedDirectedCues: number;
  totalDirectedCues: number;
  totalVideoCues: number;
  alignmentCoverage: number;
  confidence: "high" | "medium" | "low";
};

type ScriptToken = { value: string; charStart: number };
type TimedToken = { value: string; start: number; end: number };

const NUMBER_ALIASES: Record<string, string> = {
  first: "1", one: "1",
  second: "2", two: "2",
  third: "3", three: "3",
  fourth: "4", four: "4",
  fifth: "5", five: "5",
  sixth: "6", six: "6",
  seventh: "7", seven: "7",
  eighth: "8", eight: "8",
  ninth: "9", nine: "9",
  tenth: "10", ten: "10",
  eleven: "11", twelve: "12", thirteen: "13", fourteen: "14", fifteen: "15", sixteen: "16", seventeen: "17", eighteen: "18", nineteen: "19",
  twenty: "20", thirty: "30", forty: "40", fifty: "50", sixty: "60", seventy: "70", eighty: "80", ninety: "90"
};

function normalizeToken(value: string) {
  const normalized = value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
  return NUMBER_ALIASES[normalized] ?? normalized;
}

function splitTokens(value: string) {
  return value.match(/[\p{L}\p{N}]+/gu) ?? [];
}

export function tokenizeAlignmentScript(value: string): ScriptToken[] {
  const tokens: ScriptToken[] = [];
  const matcher = /[\p{L}\p{N}]+/gu;
  for (const match of value.matchAll(matcher)) tokens.push({ value: normalizeToken(match[0]), charStart: match.index ?? 0 });
  return tokens;
}

export function tokenizeTimedTranscript(words: TimedTranscriptWord[]): TimedToken[] {
  const tokens: TimedToken[] = [];
  for (const word of words) {
    for (const part of splitTokens(word.word)) tokens.push({ value: normalizeToken(part), start: Number(word.start) || 0, end: Number(word.end) || Number(word.start) || 0 });
  }
  return tokens;
}

function lcsScriptToTranscript(script: ScriptToken[], transcript: TimedToken[]) {
  const rows = script.length + 1;
  const cols = transcript.length + 1;
  const matrix = Array.from({ length: rows }, () => new Uint16Array(cols));
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      matrix[i][j] = script[i - 1].value === transcript[j - 1].value
        ? matrix[i - 1][j - 1] + 1
        : Math.max(matrix[i - 1][j], matrix[i][j - 1]);
    }
  }

  const mapping = new Map<number, number>();
  let i = script.length;
  let j = transcript.length;
  while (i > 0 && j > 0) {
    if (script[i - 1].value === transcript[j - 1].value) {
      mapping.set(i - 1, j - 1);
      i -= 1;
      j -= 1;
    } else if (matrix[i - 1][j] >= matrix[i][j - 1]) i -= 1;
    else j -= 1;
  }
  return mapping;
}

function scriptTokenAtOrAfter(tokens: ScriptToken[], charIndex: number) {
  const index = tokens.findIndex((token) => token.charStart >= charIndex);
  return index >= 0 ? index : Math.max(0, tokens.length - 1);
}

function mappedTimeNear(scriptIndex: number, mapping: Map<number, number>, transcript: TimedToken[]) {
  for (let distance = 0; distance <= 14; distance += 1) {
    const candidates = distance === 0 ? [scriptIndex] : [scriptIndex + distance, scriptIndex - distance];
    for (const candidate of candidates) {
      const transcriptIndex = mapping.get(candidate);
      if (transcriptIndex !== undefined) return transcript[transcriptIndex]?.start ?? null;
    }
  }
  return null;
}

function findTextFrom(text: string, needle: string, from = 0) {
  return text.toLocaleLowerCase().indexOf(needle.toLocaleLowerCase(), from);
}

function referenceVariants(reference: string) {
  const variants = [reference];
  const ordinal = reference.match(/^([123])\s+(.+)$/);
  if (ordinal) {
    const words: Record<string, string> = { "1": "First", "2": "Second", "3": "Third" };
    variants.push(`${words[ordinal[1]]} ${ordinal[2]}`);
  }
  return [...new Set(variants)];
}

function findReferenceFrom(text: string, reference: string, from: number) {
  let best: { index: number; length: number } | null = null;
  for (const variant of referenceVariants(reference)) {
    const index = findTextFrom(text, variant, from);
    if (index >= 0 && (!best || index < best.index)) best = { index, length: variant.length };
  }
  return best;
}

function confidenceFor(matchedScripture: number, totalScripture: number, matchedDirected: number, totalDirected: number, coverage: number): PathwayVideoAlignment["confidence"] {
  const scriptureRatio = totalScripture ? matchedScripture / totalScripture : 1;
  const directedRatio = totalDirected ? matchedDirected / totalDirected : 1;
  if (scriptureRatio >= 0.9 && directedRatio >= 0.8 && coverage >= 0.72) return "high";
  if (scriptureRatio >= 0.65 && directedRatio >= 0.55 && coverage >= 0.5) return "medium";
  return "low";
}

function timeForScriptChar(charIndex: number, scriptTokens: ScriptToken[], mapping: Map<number, number>, transcriptTokens: TimedToken[]) {
  const scriptIndex = scriptTokenAtOrAfter(scriptTokens, charIndex);
  return mappedTimeNear(scriptIndex, mapping, transcriptTokens);
}

function alignWelcome(scriptText: string, scriptTokens: ScriptToken[], mapping: Map<number, number>, transcriptTokens: TimedToken[]) {
  for (const phrase of ["Welcome to Apostolic Guide", "Welcome to", "Apostolic Guide"]) {
    const index = findTextFrom(scriptText, phrase);
    if (index < 0) continue;
    const mapped = timeForScriptChar(index, scriptTokens, mapping, transcriptTokens);
    if (mapped !== null) return Math.max(0, mapped - 0.12);
  }
  return null;
}

function alignDirectedCues(input: {
  source: PathwayVideoTimelineSource;
  directed: DirectedPathwayVideoCue[];
  scriptText: string;
  scriptTokens: ScriptToken[];
  mapping: Map<number, number>;
  transcriptTokens: TimedToken[];
}) {
  const aligned: Array<{ cue: PathwayVideoCue; charIndex: number }> = [];
  input.directed.forEach((item, index) => {
    const charIndex = findTextFrom(input.scriptText, item.anchorText);
    if (charIndex < 0) return;
    const mapped = timeForScriptChar(charIndex, input.scriptTokens, input.mapping, input.transcriptTokens);
    if (mapped === null) return;
    aligned.push({
      charIndex,
      cue: {
        id: `${input.source.slug}-directed-${String(index + 1).padStart(2, "0")}`,
        start: Number(Math.max(0, mapped - (item.kind === "question" ? 0.12 : 0.35)).toFixed(2)),
        kind: item.kind,
        eyebrow: item.eyebrow,
        title: item.title,
        body: item.body,
        reference: item.reference
      }
    });
  });
  return aligned.sort((a, b) => a.charIndex - b.charIndex).map((item) => item.cue);
}

function mergeDirectedCues(base: PathwayVideoCue[], directed: PathwayVideoCue[], duration: number) {
  if (directed.length < 4) return base;
  const fixed = base.filter((cue) => cue.kind === "brand" || cue.kind === "scripture" || cue.kind === "cta");
  const all = [...fixed, ...directed].sort((a, b) => a.start - b.start);
  const kept: PathwayVideoCue[] = [];

  for (const cue of all) {
    const fixedCue = cue.kind === "brand" || cue.kind === "scripture" || cue.kind === "cta";
    const previous = kept.at(-1);
    const nextFixed = fixed.find((candidate) => candidate.start > cue.start);
    const minGap = cue.kind === "question" ? 4.2 : 6.2;
    if (!fixedCue && previous && cue.start - previous.start < minGap) continue;
    if (!fixedCue && nextFixed && nextFixed.start - cue.start < 5.4) continue;
    kept.push(cue);
  }

  if (!kept.some((cue) => cue.kind === "question")) {
    const fallbackQuestion = base.find((cue) => cue.kind === "question");
    if (fallbackQuestion) kept.unshift(fallbackQuestion);
  }
  if (!kept.some((cue) => cue.kind === "recap")) {
    const fallbackRecap = base.find((cue) => cue.kind === "recap");
    if (fallbackRecap) kept.push(fallbackRecap);
  }
  return normalizePathwayVideoTimeline(kept, duration);
}

export function alignPathwayVideoTimeline(input: {
  source: PathwayVideoTimelineSource;
  scriptText: string;
  transcriptWords: TimedTranscriptWord[];
  duration: number;
  directedCues?: DirectedPathwayVideoCue[];
}): PathwayVideoAlignment {
  const { source, scriptText, transcriptWords } = input;
  const duration = Number.isFinite(input.duration) && input.duration > 0
    ? input.duration
    : Math.max(30, transcriptWords.at(-1)?.end ?? source.steps.length * 45);
  const timeline = buildEstimatedPathwayVideoTimeline(source, duration).map((cue) => ({ ...cue }));
  const scriptTokens = tokenizeAlignmentScript(scriptText);
  const transcriptTokens = tokenizeTimedTranscript(transcriptWords);
  const mapping = lcsScriptToTranscript(scriptTokens, transcriptTokens);
  const coverage = scriptTokens.length && transcriptTokens.length
    ? mapping.size / Math.min(scriptTokens.length, transcriptTokens.length)
    : 0;

  const brand = timeline.find((cue) => cue.kind === "brand");
  const brandStart = alignWelcome(scriptText, scriptTokens, mapping, transcriptTokens);
  if (brand && brandStart !== null) brand.start = Number(brandStart.toFixed(2));

  let matchedScriptureCues = 0;
  let searchCursor = 0;
  const scriptureCues = timeline.filter((cue) => cue.kind === "scripture");
  source.steps.forEach((step, index) => {
    const cue = scriptureCues[index];
    if (!cue) return;
    const match = findReferenceFrom(scriptText, step.reference, searchCursor);
    if (!match) return;
    searchCursor = match.index + match.length;
    const mapped = timeForScriptChar(match.index, scriptTokens, mapping, transcriptTokens);
    if (mapped === null) return;
    cue.start = Number(Math.max(0, mapped - 0.45).toFixed(2));
    matchedScriptureCues += 1;
  });

  const cta = timeline.find((cue) => cue.kind === "cta");
  if (cta) {
    for (const phrase of ["you have completed", "continue studying", "continue the"]) {
      const ctaIndex = findTextFrom(scriptText, phrase, searchCursor);
      if (ctaIndex < 0) continue;
      const mapped = timeForScriptChar(ctaIndex, scriptTokens, mapping, transcriptTokens);
      if (mapped !== null) cta.start = Number(Math.max(0, mapped - 0.3).toFixed(2));
      break;
    }
  }

  const directedInput = input.directedCues ?? [];
  const alignedDirected = alignDirectedCues({
    source,
    directed: directedInput,
    scriptText,
    scriptTokens,
    mapping,
    transcriptTokens
  });
  let finalTimeline = mergeDirectedCues(timeline, alignedDirected, duration);

  finalTimeline[0].start = 0;
  let previous = -0.25;
  finalTimeline = finalTimeline.map((cue, index) => {
    if (index === 0) return { ...cue, start: 0 };
    const remaining = finalTimeline.length - index - 1;
    const maxStart = Math.max(previous + 0.25, duration - remaining * 0.25);
    const proposed = Math.max(previous + 0.25, cue.start);
    const start = Number(Math.min(maxStart, proposed).toFixed(2));
    previous = start;
    return { ...cue, start };
  });

  return {
    timeline: normalizePathwayVideoTimeline(finalTimeline, duration),
    matchedScriptureCues,
    totalScriptureCues: source.steps.length,
    matchedDirectedCues: alignedDirected.length,
    totalDirectedCues: directedInput.length,
    totalVideoCues: finalTimeline.length,
    alignmentCoverage: Number(coverage.toFixed(3)),
    confidence: confidenceFor(matchedScriptureCues, source.steps.length, alignedDirected.length, directedInput.length, coverage)
  };
}
