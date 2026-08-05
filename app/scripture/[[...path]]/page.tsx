import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ExternalLink, Search } from "lucide-react";
import { notFound } from "next/navigation";
import { AppBridge, PageHero, SearchForm, ScriptureMiniCard } from "@/components";
import { BibleReferenceLink, ScriptureContextNote, StudyScriptures } from "@/study-guidance";
import { scriptureByPath, scriptures, topicBySlug } from "@/data";
import { buildAppSearchUrl } from "@/urls";

export function generateStaticParams() {
  return scriptures.map((item) => ({ path: item.path.split("/") }));
}

type Props = { params: Promise<{ path?: string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { path } = await params;
  if (!path?.length) return { title: "Scripture", description: "Browse the Apostolic Guide Scripture library and follow connected passages." };
  const entry = scriptureByPath(path.join("/"));
  if (!entry) return {};
  return { title: entry.reference, description: entry.mainPoint };
}

export default async function ScripturePage({ params }: Props) {
  const { path } = await params;

  if (!path?.length) {
    return (
      <>
        <PageHero variant="scripture" eyebrow="Scripture library" title="Open the text. Follow the connections." text="Search by reference, phrase, doctrine, or question. Each passage includes context, a central point, and related Scriptures." />
        <section className="section scripture-index-section">
          <div className="shell scripture-directory-shell">
            <SearchForm />
            <div className="scripture-directory-intro"><span className="eyebrow">Browse the current library</span><p>The Scripture guide is intentionally curated. Use it to locate key passages, then open your Bible and read each one in context.</p></div>
            <ScriptureContextNote />
            <div className="scripture-library scripture-library-full">
              {scriptures.map((entry) => <ScriptureMiniCard href={`/scripture/${entry.path}`} point={entry.mainPoint} reference={entry.reference} key={entry.slug} />)}
            </div>
          </div>
        </section>
        <section className="section section-tight"><div className="shell"><AppBridge origin="scripture-index" /></div></section>
      </>
    );
  }

  const entry = scriptureByPath(path.join("/"));
  if (!entry) notFound();
  const topics = entry.topicSlugs.map(topicBySlug).filter((item): item is NonNullable<ReturnType<typeof topicBySlug>> => Boolean(item));
  const studyReferences = [entry.reference, ...entry.related];

  return (
    <>
      <section className="scripture-page-hero">
        <div className="shell">
          <Link className="back-link back-link-light" href="/scripture"><ArrowLeft size={15} /> Scripture library</Link>
          <div className="scripture-reference">{entry.reference}<span>{entry.translation}</span></div>
          <blockquote>“{entry.text}”</blockquote>
          <div className="scripture-hero-actions">
            <a className="button button-paper" href={buildAppSearchUrl(entry.reference, { origin: "scripture-page" })}>Open in app <ExternalLink size={16} /></a>
            <BibleReferenceLink reference={entry.reference} className="button button-outline ei-outline-light" />
          </div>
        </div>
      </section>

      <section className="section scripture-detail-section">
        <div className="shell scripture-detail-grid">
          <article className="scripture-explanation">
            <div className="scripture-main-point"><span className="eyebrow">Main point</span><h1>{entry.mainPoint}</h1></div>
            <section data-reveal><span className="eyebrow">Context</span><h2>Read the verse in its argument.</h2><p>{entry.context}</p></section>
            <section data-reveal><span className="eyebrow">Apostolic connection</span><h2>Why this passage matters.</h2><p>{entry.apostolicConnection}</p></section>
            {entry.misunderstanding && <section className="callout" data-reveal><span>Common misunderstanding</span><h2>Do not force the verse to say more than it says.</h2><p>{entry.misunderstanding}</p></section>}
          </article>

          <aside className="scripture-sidebar">
            <div><strong>Related topics</strong>{topics.map((topic) => <Link href={`/topics/${topic.slug}`} key={topic.slug}>{topic.title}<ArrowRight size={14} /></Link>)}</div>
            <div>
              <strong>Connected passages</strong>
              {entry.related.map((reference) => {
                const related = scriptures.find((item) => item.reference === reference);
                return related
                  ? <Link href={`/scripture/${related.path}`} key={reference}>{reference}<ArrowRight size={14} /></Link>
                  : <Link href={`/search?q=${encodeURIComponent(reference)}`} key={reference}>{reference}<Search size={14} /></Link>;
              })}
            </div>
            <div><strong>Search this idea</strong><Link href={`/search?q=${encodeURIComponent(entry.mainPoint)}`}><Search size={14} /> Find related content</Link></div>
            <ScriptureContextNote />
          </aside>
        </div>
      </section>
      <section className="section section-tight"><div className="shell"><StudyScriptures references={studyReferences} /></div></section>
      <section className="section section-tight"><div className="shell"><AppBridge origin={`scripture-${entry.slug}`} compact /></div></section>
    </>
  );
}
