/**
 * Book names transcribed from the © 2021 Bible Society of Kenya
 * Ekegusii Revised Bible (EBIBILIA ENCHENU) index at https://ebible.org/guz/
 * Only bibliographic names and reference links are used here: no licensed verse text.
 * Keep canonical English references in src/pathway-catalog.ts unchanged.
 */
const BIBLE_BOOKS: Readonly<Record<string, { name: string; code: string }>> = {
  "Genesis": { name: "Omochakano", code: "GEN" },
  "Exodus": { name: "Okong’anya", code: "EXO" },
  "Deuteronomy": { name: "Okoiranerera", code: "DEU" },
  "Isaiah": { name: "Isaya", code: "ISA" },
  "Mark": { name: "Mariko", code: "MRK" },
  "1 Corinthians": { name: "1 Abakorinto", code: "1CO" },
  "2 Corinthians": { name: "2 Abakorinto", code: "2CO" },
  "Psalm": { name: "Zaburi", code: "PSA" },
  "John": { name: "Yohana", code: "JHN" },
  "Colossians": { name: "Abakolosai", code: "COL" },
  "Matthew": { name: "Matayo", code: "MAT" },
  "Luke": { name: "Luka", code: "LUK" },
  "Galatians": { name: "Abagalatia", code: "GAL" },
  "1 Timothy": { name: "1 Timotheo", code: "1TI" },
  "Hebrews": { name: "Abaiberania", code: "HEB" },
  "Acts": { name: "Ogokora Kw’abatomwa", code: "ACT" },
  "Philippians": { name: "Abafilipi", code: "PHP" },
  "Romans": { name: "Abarumi", code: "ROM" },
  "Titus": { name: "Tito", code: "TIT" },
  "Joel": { name: "Yoeli", code: "JOL" },
  "Ephesians": { name: "Abaefeso", code: "EPH" },
  "James": { name: "Yakobo", code: "JAS" },
};

export type EkegusiiBibleReference = {
  canonical: string;
  label: string;
  book: string;
  chapter: number;
  url: string;
};

/**
 * Returns the Ekegusii label and opens the actual book/chapter HTML on eBible.
 * eBible uses 3-digit chapter files for Psalms and 2 digits for other books.
 * Unsupported or malformed source references produce null, not invented links.
 */
export function ekegusiiBibleReference(reference: string): EkegusiiBibleReference | null {
  const match = /^(.+?)\s+(\d{1,3}):(\d{1,3}(?:[\u2013\u2014-]\d{1,3})?)$/.exec(reference.trim());
  if (!match) return null;
  const book = BIBLE_BOOKS[match[1]];
  const chapter = Number(match[2]);
  const firstVerse = Number(match[3].split(/[\u2013\u2014-]/)[0]);
  if (!book || !Number.isInteger(chapter) || chapter < 1 || chapter > 150 || firstVerse < 1 || firstVerse > 176) return null;
  const chapterDigits = book.code === "PSA" ? 3 : 2;
  const file = book.code + String(chapter).padStart(chapterDigits,"0") + ".htm";
  return {
    canonical: reference,
    label: book.name + " " + match[2] + ":" + match[3],
    book: book.name,
    chapter,
    url: "https://ebible.org/guz/" + file,
  };
}

export function displayEkegusiiBibleReference(reference: string): string {
  return ekegusiiBibleReference(reference)?.label ?? reference;
}
