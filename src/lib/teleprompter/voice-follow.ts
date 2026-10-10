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
/** The transcript can omit a weak word, or Safari can recognize a word's
 * singular/plural form. Keep the *actual* script tokens unchanged for display. */
function wordSimilarity(spoken: string, expected: string): number {
  if (spoken === expected) return 1;
  const singular = (word: string) =>
    word.length >= 4 && word.endsWith("s") && !word.endsWith("ss")
      ? word.slice(0, -1)
      : word;
  if (singular(spoken) === singular(expected) && singular(spoken).length >= 3) return 0.94;

  // One dropped/extra/misheard letter in a reasonably distinctive word.
  // Short words ("he", "is", "the") stay exact to avoid false jumps.
  if (Math.min(spoken.length, expected.length) < 4 ||
      Math.max(spoken.length, expected.length) < 5 ||
      Math.abs(spoken.length - expected.length) > 1) return 0;
  let left = 0;
  while (left < Math.min(spoken.length, expected.length) &&
         spoken[left] === expected[left]) left++;
  if (left === spoken.length && left === expected.length) return 1;
  if (spoken.length === expected.length) {
    let differences = 0;
    for (let i = left; i < spoken.length; i++) {
      if (spoken[i] !== expected[i] && ++differences > 1) return 0;
    }
    return differences === 1 ? 0.78 : 0;
  }
  const longer = spoken.length > expected.length ? spoken : expected;
  const shorter = spoken.length > expected.length ? expected : spoken;
  return longer.slice(0, left) === shorter.slice(0, left) &&
    longer.slice(left + 1) === shorter.slice(left) ? 0.78 : 0;
}

export function findVoiceMatch(
  transcript: string, script: string[], cursor: number, searchAhead = 110,
): VoiceFollowMatch | null {
  const spoken = tokenizeSpeech(transcript);
  if (!spoken.length || !script.length) return null;
  const safeCursor = Math.max(0, Math.min(script.length, Math.trunc(cursor)));
  const isShort = spoken.length <= 3;
  const ahead = spoken.length === 1 ? 2 :
    spoken.length === 2 ? 7 : spoken.length === 3 ? 14 : searchAhead;
  const first = Math.max(0, safeCursor - (isShort ? 3 : 12));
  const last = Math.min(script.length - 1, safeCursor + ahead);
  let best: VoiceFollowMatch | null = null;

  for (let start = first; start <= last; start++) {
    // A one-word result can advance exactly one nearby word, never jump
    // to another occurrence of a generic short word elsewhere in the script.
    if (spoken.length === 1) {
      if (spoken[0].length < 4 || start < safeCursor ||
          start > safeCursor + 1 || wordSimilarity(spoken[0], script[start]) < 0.94) continue;
      const candidate = { start, end: start + 1, score: 0.94 - (start - safeCursor) * 0.06 };
      if (!best || candidate.score > best.score) best = candidate;
      continue;
    }

    let nextScriptIndex = start;
    let matched = 0;
    let totalWeight = 0;
    let scriptGaps = 0;
    let end = start;
    for (const word of spoken) {
      let chosen = -1;
      let chosenWeight = 0;
      // A missed short word or recognition insertion shouldn't strand the
      // cursor. Bound the window to avoid accidental long-distance matches.
      for (let skip = 0; skip <= 2 && nextScriptIndex + skip < script.length; skip++) {
        const index = nextScriptIndex + skip;
        const weight = wordSimilarity(word, script[index]);
        if (weight - skip * 0.10 > chosenWeight) {
          chosenWeight = weight - skip * 0.10;
          chosen = weight ? index : -1;
        }
      }
      if (chosen < 0) continue; // Safari inserted an extra word.
      totalWeight += wordSimilarity(word, script[chosen]);
      matched++;
      scriptGaps += chosen - nextScriptIndex;
      nextScriptIndex = chosen + 1;
      end = nextScriptIndex;
      if (nextScriptIndex >= script.length) break;
    }
    if (end <= safeCursor || matched < 2) continue;
    const coverage = totalWeight / spoken.length;
    const distance = Math.max(0, start - safeCursor);
    const score = coverage -
      scriptGaps * 0.025 -
      Math.min(0.18, distance / Math.max(110, ahead * 6)) -
      (start < safeCursor - 5 ? 0.04 : 0);

    // Two-word phrases are useful near the current cursor but too ambiguous
    // for larger jumps. Longer phrases provide safer context.
    if (spoken.length === 2) {
      if (matched !== 2 || coverage < 0.92 || scriptGaps > 1 ||
          start < safeCursor - 2 || start > safeCursor + 7) continue;
    } else {
      const minimumHits = Math.max(2, Math.ceil(spoken.length * 0.55));
      if (matched < minimumHits || coverage < 0.68 || score < 0.64) continue;
    }

    const candidate = { start, end, score };
    if (!best || candidate.score > best.score + 0.001 ||
      (Math.abs(candidate.score - best.score) <= 0.001 &&
        Math.abs(candidate.start - safeCursor) < Math.abs(best.start - safeCursor))) {
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
