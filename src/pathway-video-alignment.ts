import { buildEstimatedPathwayVideoTimeline, normalizePathwayVideoTimeline, type PathwayVideoCue, type PathwayVideoTimelineSource } from "./pathway-video";

export type TimedTranscriptWord = {
  word: string;
  start: number;
  end: number;
};

export type PathwayVideoAlignment = {
  timeline: PathwayVideoCue[];
  matchedScriptureCues: number;
  totalScriptureCues: number;
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
  for (const match of value.matchAll(matcher)) {
    const raw = match[0];
    tokens.push({ value: normalizeToken(raw), charStart: match.index ?? 0 });
  }
  return tokens;
}

export function tokenizeTimedTranscript(words: TimedTranscriptWord[]): TimedToken[] {
  const tokens: TimedToken[] = [];
  for (const word of words) {
    const parts = splitTokens(word.word);
    for (const part of parts) tokens.push({ value: normalizeToken(part), start: Number(word.start) || 0, end: Number(word.end) || Number(word.start) || 0 });
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

function confidenceFor(matched: number, total: number, coverage: number): PathwayVideoAlignment["confidence"] {
  const cueRatio = total ? matched / total : 1;
  if (cueRatio >= 0.9 && coverage >= 0.72) return "high";
  if (cueRatio >= 0.65 && coverage >= 0.5) return "medium";
  return "low";
}

export function alignPathwayVideoTimeline(input: {
  source: PathwayVideoTimelineSource;
  scriptText: string;
  transcriptWords: TimedTranscriptWord[];
  duration: number;
}): PathwayVideoAlignment {
  const { source, scriptText, transcriptWords } = input;
  const duration = Number.isFinite(input.duration) && input.duration > 0
    ? input.duration
    : Math.max(30, transcriptWords.at(-1)?.end ?? source.steps.length * 45);
  const fallback = buildEstimatedPathwayVideoTimeline(source, duration);
  const scriptTokens = tokenizeAlignmentScript(scriptText);
  const transcriptTokens = tokenizeTimedTranscript(transcriptWords);
  const mapping = lcsScriptToTranscript(scriptTokens, transcriptTokens);
  const coverage = scriptTokens.length && transcriptTokens.length
    ? mapping.size / Math.min(scriptTokens.length, transcriptTokens.length)
    : 0;

  const timeline = fallback.map((cue) => ({ ...cue }));
  let matchedScriptureCues = 0;
  let searchCursor = 0;

  source.steps.forEach((step, index) => {
    const cue = timeline[index + 1];
    if (!cue) return;
    const charIndex = findTextFrom(scriptText, step.reference, searchCursor);
    if (charIndex < 0) return;
    searchCursor = charIndex + step.reference.length;
    const scriptIndex = scriptTokenAtOrAfter(scriptTokens, charIndex);
    const mapped = mappedTimeNear(scriptIndex, mapping, transcriptTokens);
    if (mapped === null) return;
    cue.start = Number(Math.max(0, mapped - 0.45).toFixed(2));
    matchedScriptureCues += 1;
  });

  const cta = timeline.at(-1);
  if (cta) {
    const ctaPhrases = ["you have completed", "continue studying", "continue the"];
    let ctaIndex = -1;
    for (const phrase of ctaPhrases) {
      ctaIndex = findTextFrom(scriptText, phrase, searchCursor);
      if (ctaIndex >= 0) break;
    }
    if (ctaIndex >= 0) {
      const scriptIndex = scriptTokenAtOrAfter(scriptTokens, ctaIndex);
      const mapped = mappedTimeNear(scriptIndex, mapping, transcriptTokens);
      if (mapped !== null) cta.start = Number(Math.max(0, mapped - 0.3).toFixed(2));
    }
  }

  const normalized = normalizePathwayVideoTimeline(timeline, duration);
  let previous = -0.25;
  for (let index = 0; index < normalized.length; index += 1) {
    if (index === 0) {
      normalized[index].start = 0;
      previous = 0;
      continue;
    }
    const ceiling = Math.max(previous + 0.25, duration - Math.max(0.25, (normalized.length - index - 1) * 0.25));
    normalized[index].start = Number(Math.min(ceiling, Math.max(previous + 0.25, normalized[index].start)).toFixed(2));
    previous = normalized[index].start;
  }

  return {
    timeline: normalized,
    matchedScriptureCues,
    totalScriptureCues: source.steps.length,
    alignmentCoverage: Number(coverage.toFixed(3)),
    confidence: confidenceFor(matchedScriptureCues, source.steps.length, coverage)
  };
}
