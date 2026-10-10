/**
 * Deterministic script tracking for Voice Follow.
 * Accepts incremental/final recognition results from any microphone transport.
 * No model access, DOM manipulation, or audio recording happens in this module.
 */
export type VoiceFollowMode = "following" | "paused" | "improvising" | "reacquiring";
export interface VoiceFollowNote {
  anchorWord: number;
  startedAt: number;
  endedAt: number;
  text: string;
  reference?: string;
}
export interface VoiceFollowState {
  cursorWord: number;
  mode: VoiceFollowMode;
  lastSpeechAt: number;
  consecutiveMatches: number;
  improvisation: string[];
  improvStartedAt: number | null;
  completedNotes: VoiceFollowNote[];
}
export interface VoiceFollowEvent {
  transcript: string;
  final: boolean;
  speaking: boolean;
  at: number;
}
export interface VoiceFollowMatch { start: number; end: number; score: number }

export function tokenizeSpeech(input: string): string[] {
  return input.toLowerCase().normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/).filter(Boolean);
}
export function initialVoiceFollowState(): VoiceFollowState {
  return {
    cursorWord: 0, mode: "paused", lastSpeechAt: 0,
    consecutiveMatches: 0, improvisation: [], improvStartedAt: null, completedNotes: [],
  };
}
function orderedHits(a: string[], b: string[]): number {
  let count = 0;
  let targetIndex = 0;
  for (const token of a) {
    while (targetIndex < b.length && b[targetIndex] !== token) targetIndex++;
    if (targetIndex >= b.length) break;
    count++;
    targetIndex++;
  }
  return count;
}
export function findVoiceMatch(
  transcript: string, script: string[], cursor: number, searchAhead = 110,
): VoiceFollowMatch | null {
  const spoken = tokenizeSpeech(transcript);
  if (spoken.length < 3 || script.length < 3) return null;
  let best: VoiceFollowMatch | null = null;
  const first = Math.max(0, cursor - 12);
  const last = Math.min(script.length - 3, cursor + searchAhead);
  for (let start = first; start <= last; start++) {
    const window = script.slice(start, Math.min(script.length, start + spoken.length + 5));
    if (window.length < 3) continue;
    const hits = orderedHits(spoken, window);
    const fidelity = hits / spoken.length;
    const distance = Math.max(0, start - cursor);
    const score = fidelity - Math.min(0.16, distance / Math.max(100, searchAhead * 5));
    if (hits < 3 || score < 0.64) continue;
    const candidate = { start, end: Math.min(script.length, start + spoken.length), score };
    if (!best || candidate.score > best.score ||
        (candidate.score === best.score && Math.abs(start - cursor) < Math.abs(best.start - cursor))) {
      best = candidate;
    }
  }
  return best;
}
const REFERENCE_PATTERN = /\b(?:1|2|3)?\s?(?:genesis|exodus|leviticus|numbers|deuteronomy|isaiah|jeremiah|ezekiel|daniel|matthew|mark|luke|john|acts|romans|corinthians|galatians|ephesians|philippians|colossians|timothy|titus|hebrews|james|peter|jude|revelation)\s+(?:chapter\s+)?\d+(?:\s*(?::|verse|verses)\s*\d+(?:\s*(?:to|through|-)\s*\d+)?)?/i;
export function detectScriptureReference(spoken: string): string | undefined {
  return spoken.match(REFERENCE_PATTERN)?.[0];
}
export function advanceVoiceFollow(
  state: VoiceFollowState,
  event: VoiceFollowEvent,
  scriptWords: string[],
): VoiceFollowState {
  const match = findVoiceMatch(event.transcript, scriptWords, state.cursorWord);
  if (!event.speaking && !event.transcript.trim()) {
    return { ...state, mode: state.improvisation.length ? "improvising" : "paused" };
  }
  if (!event.transcript.trim()) return { ...state, lastSpeechAt: event.at };

  if (!match) {
    if (!event.final) return { ...state, lastSpeechAt: event.at };
    return {
      ...state,
      mode: "improvising", consecutiveMatches: 0, lastSpeechAt: event.at,
      improvStartedAt: state.improvStartedAt ?? event.at,
      improvisation: [...state.improvisation, event.transcript.trim()],
    };
  }

  // Require two distinct finalized matches before ending an off-script passage.
  if (state.mode === "improvising" || state.mode === "reacquiring") {
    const hits = event.final ? state.consecutiveMatches + 1 : state.consecutiveMatches;
    if (hits < 2) {
      return { ...state, lastSpeechAt: event.at, consecutiveMatches: hits, mode: "reacquiring" };
    }
    const text = state.improvisation.join(" ").trim();
    const note: VoiceFollowNote | null = text ? {
      anchorWord: state.cursorWord,
      startedAt: state.improvStartedAt ?? event.at,
      endedAt: event.at,
      text, reference: detectScriptureReference(text),
    } : null;
    return {
      ...state, mode: "following", lastSpeechAt: event.at,
      cursorWord: Math.max(state.cursorWord, match.end), consecutiveMatches: 0,
      improvisation: [], improvStartedAt: null,
      completedNotes: note ? [...state.completedNotes, note] : state.completedNotes,
    };
  }

  // Never backtrack automatically; presenter can explicitly navigate backward.
  return {
    ...state, mode: "following", lastSpeechAt: event.at,
    cursorWord: Math.max(state.cursorWord, match.end),
    consecutiveMatches: 0,
  };
}
/** Call on Stop to preserve an unfinished improvisation without editing the script. */
export function finishVoiceFollow(state: VoiceFollowState, at: number): VoiceFollowState {
  const text = state.improvisation.join(" ").trim();
  if (!text) return { ...state, mode: "paused" };
  const note: VoiceFollowNote = {
    anchorWord: state.cursorWord, startedAt: state.improvStartedAt ?? at,
    endedAt: at, text, reference: detectScriptureReference(text),
  };
  return {
    ...state, mode: "paused", improvisation: [], improvStartedAt: null,
    consecutiveMatches: 0, completedNotes: [...state.completedNotes, note],
  };
}
