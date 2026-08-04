import Link from "next/link";
import { ArrowRight, BookOpen, ExternalLink } from "lucide-react";

export function biblePassageUrl(reference: string) {
  const normalized = reference.replace(/[–—]/g, "-");
  return `https://www.biblegateway.com/passage/?search=${encodeURIComponent(normalized)}&version=KJV`;
}

export function BibleReferenceLink({
  reference,
  label = "Read in Bible",
  className = ""
}: {
  reference: string;
  label?: string;
  className?: string;
}) {
  return (
    <a
      className={`bible-reference-link ${className}`.trim()}
      href={biblePassageUrl(reference)}
      target="_blank"
      rel="noopener noreferrer"
    >
      {label} <ExternalLink size={14} />
    </a>
  );
}

export function ScriptureContextNote() {
  return (
    <div className="scripture-context-note">
      <BookOpen size={16} aria-hidden />
      <span><strong>Read every passage in context.</strong> Open the surrounding chapter as you study.</span>
      <Link href="/how-it-works">See the method <ArrowRight size={13} /></Link>
    </div>
  );
}

export function StudyScriptures({ references = [] }: { references?: string[] }) {
  const uniqueReferences = Array.from(new Set(references.filter(Boolean))).slice(0, 12);

  return (
    <section className="study-scriptures" data-reveal>
      <div className="study-scriptures-copy">
        <span className="eyebrow">Study the Scriptures</span>
        <h2>Open the passages for yourself.</h2>
        <p>Apostolic Guide gives you a starting point, not a substitute for the text. Read each reference in its surrounding chapter, compare Scripture with Scripture, and let the Bible shape your conclusion.</p>
      </div>

      <div className="study-scriptures-actions">
        {uniqueReferences.length > 0 && (
          <div className="study-reference-list" aria-label="Open referenced passages in an external Bible">
            {uniqueReferences.map((reference) => (
              <BibleReferenceLink key={reference} reference={reference} label={reference} />
            ))}
          </div>
        )}
        <div className="study-method-links">
          <Link href="/how-it-works">How Apostolic Guide works <ArrowRight size={15} /></Link>
          <Link href="/scripture">Browse the Scripture guide <BookOpen size={15} /></Link>
        </div>
      </div>
    </section>
  );
}
