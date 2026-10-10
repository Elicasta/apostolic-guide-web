import { tokenizeSpeech } from "./voice-follow";

export interface SpokenWordPart {
  text: string;
  wordOffset: number | null;
}

/**
 * Preserve the visible text, punctuation and whitespace while assigning the same
 * word offsets used by Voice Follow's normalized script transcript.
 * Returned offsets are local to each plain-text segment.
 */
export function splitSpokenWordParts(text: string): SpokenWordPart[] {
  const parts = text.match(/[A-Za-z0-9\u00c0-\u024f]+|[^A-Za-z0-9\u00c0-\u024f]+/g) ?? [];
  let wordOffset = 0;
  return parts.map(part => {
    const wordCount = tokenizeSpeech(part).length;
    // Unsupported alphabets and separators remain visible without affecting alignment.
    if (wordCount !== 1) return { text: part, wordOffset: null };
    return { text: part, wordOffset: wordOffset++ };
  });
}

/** Returns the last recognized word, or the first word while waiting to start. */
export function highlightedWordIndex(cursorWord: number, wordsInSlide: number): number | null {
  if (!Number.isFinite(cursorWord) || wordsInSlide <= 0) return null;
  return Math.max(0, Math.min(wordsInSlide - 1, Math.trunc(cursorWord) - 1));
}
