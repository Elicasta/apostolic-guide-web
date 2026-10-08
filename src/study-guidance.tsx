import Link from "next/link";
import { InlineStudyScriptures } from "./inline-study-scriptures";
import styles from "./inline-study-scriptures.module.css";
import { ArrowRight, BookOpen } from "lucide-react";
import { BibleReferenceLink } from "./bible-links";

export { extractScriptureReferences } from "./scripture-references";

export { bibleGatewayUrl as biblePassageUrl } from "./bible-links";

export { BibleReferenceLink };

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
  const uniqueReferences = Array.from(new Set(references.filter(Boolean)));

  return (
    <section className={`study-scriptures ${styles.study}`} data-reveal>
      <div className="study-scriptures-copy">
        <span className="eyebrow">Study the Scriptures</span>
        <h2>Read the full passages here.</h2>
        <p>Read the full KJV text below. Expand a passage to study it, follow its explanation where a pathway connects, and open the surrounding chapter for context.</p>
      </div>

      <div className="study-scriptures-actions">
        {uniqueReferences.length > 0 && (
          <InlineStudyScriptures references={uniqueReferences} />
        )}
        <div className="study-method-links">
          <Link href="/how-it-works">How Apostolic Guide works <ArrowRight size={15} /></Link>
          <Link href="/scripture">Browse the Scripture guide <BookOpen size={15} /></Link>
        </div>
      </div>
    </section>
  );
}
