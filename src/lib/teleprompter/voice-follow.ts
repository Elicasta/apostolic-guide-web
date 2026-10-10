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
  /** One unconfirmed Safari final must not be treated as an improvisation. */
  pendingUnmatched: string[];
  pendingUnmatchedAt: number | null;
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
    pendingUnmatched: [], pendingUnmatchedAt: null,
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
  if (spoken.length < 2 || script.length < 2) return null;
  let best: VoiceFollowMatch | null = null;
  const first = Math.max(0, cursor - 12);
  const last = Math.min(script.length - 2, cursor + searchAhead);
  for (let start = first; start <= last; start++) {
    const window = script.slice(start, Math.min(script.length, start + spoken.length + 5));
    if (window.length < 2) continue;
    const hits = orderedHits(spoken, window);
    const fidelity = hits / spoken.length;
    const distance = Math.max(0, start - cursor);
    const score = fidelity - Math.min(0.16, distance / Math.max(100, searchAhead * 5));
    // Two-word recognition is useful near the cursor, but never jump far on it.
    const nearbyShortPhrase = spoken.length === 2 && start >= cursor - 3 && start <= cursor + 8;
    if (hits < (nearbyShortPhrase ? 2 : 3) || score < (nearbyShortPhrase ? 0.89 : 0.68)) continue;
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
  return spoken.match(REFERENCE_PATTERN)?.[0]?.trim();
}
export function advanceVoiceFollow(
  state: VoiceFollowState,
  event: VoiceFollowEvent,
  scriptWords: string[],
): VoiceFollowState {
  if (!event.speaking && !event.transcript.trim()) {
    // An ordinary pause is not improvisation. Keep any captured off-script
    // words for later, but show Waiting and never advance the cursor.
    return {
      ...state,
      mode: "paused",
      consecutiveMatches: 0,
      pendingUnmatched: [],
      pendingUnmatchedAt: null,
    };
  }
  if (!event.transcript.trim()) return { ...state, lastSpeechAt: event.at };

  const spoken = event.transcript.trim();
  const match = findVoiceMatch(spoken, scriptWords, state.cursorWord);
  const hadImprovisation = state.improvisation.length > 0;

  if (!match) {
    if (!event.final) return { ...state, lastSpeechAt: event.at };
    const spokenLength = tokenizeSpeech(spoken).length;

    if (hadImprovisation) {
      // Confirmed improvisation continues until matched script text resumes.
      const previous = state.improvisation[state.improvisation.length - 1];
      return {
        ...state, mode: "improvising", consecutiveMatches: 0, lastSpeechAt: event.at,
        improvisation: previous === spoken ? state.improvisation : [...state.improvisation, spoken],
      };
    }

    // Safari can finalize one imperfect/partial phrase when the speaker takes
    // a natural breath. A single unmatched phrase is inconclusive.
    if (spokenLength < 4) return { ...state, lastSpeechAt: event.at };

    const recentPending = state.pendingUnmatchedAt !== null &&
      event.at - state.pendingUnmatchedAt <= 6500;
    const pending = recentPending ? state.pendingUnmatched : [];
    if (pending.length === 0) {
      return {
        ...state, lastSpeechAt: event.at, consecutiveMatches: 0,
        pendingUnmatched: [spoken], pendingUnmatchedAt: event.at,
      };
    }
    // Duplicate Safari final results from one phrase are not evidence of a
    // second off-script statement.
    if (pending[pending.length - 1] === spoken) {
      return { ...state, lastSpeechAt: event.at };
    }
    return {
      ...state,
      mode: "improvising", consecutiveMatches: 0, lastSpeechAt: event.at,
      improvStartedAt: state.pendingUnmatchedAt ?? event.at,
      improvisation: [...pending, spoken],
      pendingUnmatched: [], pendingUnmatchedAt: null,
    };
  }

  // Returning to a manuscript after a pause does not require "rejoining".
  // Reacquisition is needed only after a confirmed off-script passage.
  if (hadImprovisation) {
    const spokenLength = tokenizeSpeech(spoken).length;
    const confident = match.score >= 0.86 && spokenLength >= 4;
    const confirmations = event.final ? state.consecutiveMatches + 1 : state.consecutiveMatches;
    if (!confident && confirmations < 2) {
      return { ...state, lastSpeechAt: event.at, consecutiveMatches: confirmations, mode: "reacquiring" };
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
      pendingUnmatched: [], pendingUnmatchedAt: null,
      completedNotes: note ? [...state.completedNotes, note] : state.completedNotes,
    };
  }

  // Never backtrack automatically; presenter can explicitly navigate backward.
  return {
    ...state, mode: "following", lastSpeechAt: event.at,
    cursorWord: Math.max(state.cursorWord, match.end),
    consecutiveMatches: 0, pendingUnmatched: [], pendingUnmatchedAt: null,
  };
}
/** Call on Stop to preserve an unfinished improvisation without editing the script. */
export function finishVoiceFollow(state: VoiceFollowState, at: number): VoiceFollowState {
  const text = state.improvisation.join(" ").trim();
  if (!text) return {
    ...state, mode: "paused", pendingUnmatched: [], pendingUnmatchedAt: null,
  };
  const note: VoiceFollowNote = {
    anchorWord: state.cursorWord, startedAt: state.improvStartedAt ?? at,
    endedAt: at, text, reference: detectScriptureReference(text),
  };
  return {
    ...state, mode: "paused", improvisation: [], improvStartedAt: null,
    consecutiveMatches: 0, completedNotes: [...state.completedNotes, note],
    pendingUnmatched: [], pendingUnmatchedAt: null,
  };
}
