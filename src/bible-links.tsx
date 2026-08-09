import { BookOpen, ExternalLink } from "lucide-react";

const youVersionBooks: Record<string, string> = {
  Genesis: "GEN", Exodus: "EXO", Leviticus: "LEV", Numbers: "NUM", Deuteronomy: "DEU", Joshua: "JOS", Judges: "JDG", Ruth: "RUT",
  "1 Samuel": "1SA", "2 Samuel": "2SA", "1 Kings": "1KI", "2 Kings": "2KI", "1 Chronicles": "1CH", "2 Chronicles": "2CH", Ezra: "EZR", Nehemiah: "NEH",
  Esther: "EST", Job: "JOB", Psalm: "PSA", Psalms: "PSA", Proverbs: "PRO", Ecclesiastes: "ECC", "Song of Solomon": "SNG", Isaiah: "ISA", Jeremiah: "JER",
  Lamentations: "LAM", Ezekiel: "EZK", Daniel: "DAN", Hosea: "HOS", Joel: "JOL", Amos: "AMO", Obadiah: "OBA", Jonah: "JON", Micah: "MIC", Nahum: "NAM",
  Habakkuk: "HAB", Zephaniah: "ZEP", Haggai: "HAG", Zechariah: "ZEC", Malachi: "MAL", Matthew: "MAT", Mark: "MRK", Luke: "LUK", John: "JHN", Acts: "ACT",
  Romans: "ROM", "1 Corinthians": "1CO", "2 Corinthians": "2CO", Galatians: "GAL", Ephesians: "EPH", Philippians: "PHP", Colossians: "COL",
  "1 Thessalonians": "1TH", "2 Thessalonians": "2TH", "1 Timothy": "1TI", "2 Timothy": "2TI", Titus: "TIT", Philemon: "PHM", Hebrews: "HEB", James: "JAS",
  "1 Peter": "1PE", "2 Peter": "2PE", "1 John": "1JN", "2 John": "2JN", "3 John": "3JN", Jude: "JUD", Revelation: "REV"
};

export function normalizeBibleReference(reference: string) {
  return reference.replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
}

export function bibleGatewayUrl(reference: string) {
  return `https://www.biblegateway.com/passage/?search=${encodeURIComponent(normalizeBibleReference(reference))}&version=KJV`;
}

export function youVersionUrl(reference: string) {
  const normalized = normalizeBibleReference(reference);
  const match = normalized.match(/^((?:[1-3]\s)?[A-Za-z]+(?:\s(?:of|Solomon))?)\s+(\d{1,3}):(\d{1,3}(?:-\d{1,3})?)$/i);
  if (!match) return null;

  const [, rawBook, chapter, verses] = match;
  const canonicalBook = Object.keys(youVersionBooks).find((book) => book.toLowerCase() === rawBook.toLowerCase());
  if (!canonicalBook) return null;

  return `https://bible.com/bible/1/${youVersionBooks[canonicalBook]}.${chapter}.${verses}.KJV`;
}

export function BibleReferenceLink({
  reference,
  label = "Open Bible",
  className = ""
}: {
  reference: string;
  label?: string;
  className?: string;
}) {
  const youVersion = youVersionUrl(reference);
  const gateway = bibleGatewayUrl(reference);

  return (
    <details className="bible-open-wrap">
      <summary className={`bible-reference-link ${className}`.trim()}>
        {label} <ExternalLink size={14} />
      </summary>
      <div className="bible-open-menu">
        <strong className="bible-open-menu-reference">{reference}</strong>
        {youVersion && (
          <a href={youVersion}>
            <BookOpen size={16} />
            <span><b>Open in Bible app</b><small>YouVersion / Bible.com</small></span>
          </a>
        )}
        <a href={gateway} target="_blank" rel="noopener noreferrer">
          <ExternalLink size={16} />
          <span><b>Open in Bible Gateway</b><small>Browser fallback · KJV</small></span>
        </a>
      </div>
    </details>
  );
}
