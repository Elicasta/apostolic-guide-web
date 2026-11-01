import "server-only";
import Link from "next/link";
import corpus from "./scripture-data/kjv.json";
import { readKjvPassage, scriptureEmphasisParts } from "./kjv-reader";
import { pathwayKjvPassages } from "./pathway-kjv";
import { allPathways } from "./pathway-catalog";
import { BibleReferenceLink } from "./bible-links";
import styles from "./inline-study-scriptures.module.css";

export function InlineStudyScriptures({ references }: { references: string[] }) {
  return <div className={styles.passages}>{references.map((reference, index) => {
    const normalize = (value: string) => value.toLowerCase().replace(/[–—]/g, "-").replace(/^psalms /, "psalm ");
    const canonical = Object.values(pathwayKjvPassages).find(p => normalize(p.reference) === normalize(reference));
    const passage = canonical || readKjvPassage(corpus, reference);
    const pathway = allPathways.find(p => p.steps.some(s => normalize(s.reference) === normalize(reference)));
    const step = pathway?.steps.find(s => normalize(s.reference) === normalize(reference));
    return <details className={styles.passage} key={reference} open={index === 0}>
      <summary>{reference}<span>KJV · Read passage</span></summary>
      {passage ? <blockquote>{passage.verses.map(verse => <p key={verse.number}><sup>{verse.number}</sup> {scriptureEmphasisParts(verse.text, passage.emphasis).map((part, i) => part.emphasized ? <strong className={styles.emphasis} key={i}>{part.text}</strong> : <span key={i}>{part.text}</span>)}</p>)}</blockquote> : <p>This reference needs the surrounding Bible text. Open the chapter below.</p>}
      {step && <div className={styles.explanation}><strong>Why this passage matters</strong><p>{step.explanation}</p>{step.hook && <p><strong>Where the argument goes next:</strong> {step.hook}</p>}<Link href={`/pathways/${pathway!.slug}`}>Follow {pathway!.title}</Link></div>}
      <BibleReferenceLink reference={reference} label="Open surrounding chapter" />
    </details>;
  })}</div>;
}
