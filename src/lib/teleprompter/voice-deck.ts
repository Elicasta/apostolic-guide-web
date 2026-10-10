import type { TeleprompterSlide } from "./types";
import { tokenizeSpeech } from "./voice-follow";

/** Words actually displayed for reading; exclude headings and private notes. */
export function spokenSlideLines(slide: TeleprompterSlide): string[] {
  return slide.raw.split("\n")
    .map(line => line.trim())
    .filter(line => line && !line.startsWith("# ") && !line.startsWith("@note ") && !line.startsWith("@ref "))
    .map(line => line.replace(/^>\s*/, "").replace(/\*\*(.*?)\*\*/g, "$1").trim())
    .filter(Boolean);
}
export interface VoiceDeck {
  words: string[];
  ranges: { start: number; end: number }[];
}
export function createVoiceDeck(slides: TeleprompterSlide[]): VoiceDeck {
  const words: string[] = [];
  const ranges = slides.map(slide => {
    const start = words.length;
    for (const line of spokenSlideLines(slide)) words.push(...tokenizeSpeech(line));
    return { start, end: words.length };
  });
  return { words, ranges };
}
export function findDeckPosition(deck: VoiceDeck, cursorWord: number): { slideIndex: number; wordIndex: number } {
  if (!deck.ranges.length) return { slideIndex: 0, wordIndex: 0 };
  const cursor = Math.max(0, Math.trunc(cursorWord));
  const slideIndex = Math.max(0, deck.ranges.findIndex(range => cursor < range.end));
  const resolved = deck.ranges.findIndex(range => cursor < range.end);
  const index = resolved < 0 ? deck.ranges.length - 1 : slideIndex;
  const range = deck.ranges[index];
  return { slideIndex: index, wordIndex: Math.max(0, Math.min(cursor - range.start, range.end - range.start)) };
}
export function deckCursorForPosition(deck: VoiceDeck, slideIndex: number, wordIndex: number): number {
  const range = deck.ranges[Math.max(0, Math.min(deck.ranges.length - 1, slideIndex))];
  return range ? Math.min(range.end, range.start + Math.max(0, wordIndex)) : 0;
}
