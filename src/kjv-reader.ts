import type { PathwayKjvPassage } from "./pathway-kjv-types";
export type KjvCorpus = Record<string, Record<string, Record<string, string>>>;
export function readKjvPassage(corpus: KjvCorpus, reference: string): PathwayKjvPassage | null {
  const match = reference.trim().replace(/\s+/g, " ").match(/^(.+?) (\d{1,3}):(\d{1,3})(?:[–—-](\d{1,3}))?$/);
  if (!match) return null;
  const bookName = match[1].replace(/^Psalm$/i, "Psalms");
  const book = Object.keys(corpus).find(name => name.toLowerCase() === bookName.toLowerCase());
  const start = Number(match[3]), end = Number(match[4] || match[3]);
  if (!book || end < start || end - start > 175) return null;
  const chapter = corpus[book][String(Number(match[2]))];
  if (!chapter) return null;
  const verses = [];
  for (let number = start; number <= end; number++) {
    const text = chapter[String(number)];
    if (!text) return null;
    // Strip display markup, preserving every word of the KJV source.
    verses.push({ number, text: text.replace(/[\[\]{}]/g, "").replace(/[’‘]/g, "'").replace(/[“”]/g, '"') });
  }
  return { reference, translation: "KJV", verses, emphasis: [] };
}
export function scriptureEmphasisParts(text: string, phrases: string[]) {
  const selected = phrases.filter(p => p.trim()).sort((a, b) => b.length - a.length);
  if (!selected.length) return [{ text, emphasized: false }];
  const escaped = selected.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return text.split(new RegExp(`(${escaped.join("|")})`, "gi")).filter(Boolean).map(part => ({ text: part, emphasized: selected.some(p => p.toLowerCase() === part.toLowerCase()) }));
}
