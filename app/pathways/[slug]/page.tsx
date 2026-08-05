import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Clock3, ExternalLink } from "lucide-react";
import { notFound } from "next/navigation";
import { BibleReferenceLink, StudyScriptures } from "@/study-guidance";
import { SmartNext } from "@/smart-next";
import { pathwaySuggestions } from "@/suggestion-data";
import { scriptures, topicBySlug } from "@/data";
import { allPathways, pathwayBySlug } from "@/pathway-catalog";
import { buildAppUrl } from "@/urls";

export function generateStaticParams() { return allPathways.map((pathway) => ({ slug: pathway.slug })); }

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const pathway = pathwayBySlug(slug);
  if (!pathway) return {};
  return { title: pathway.title, description: pathway.summary };
}

export default async function PathwayPage({ params }: Props) {
  const { slug } = await params;
  const pathway = pathwayBySlug(slug);
  if (!pathway) notFound();
  const topic = topicBySlug(pathway.topicSlug);
  const collectionItems = allPathways.filter((item) => item.collection === pathway.collection);
  const currentIndex = collectionItems.findIndex((item) => item.slug === pathway.slug);
  const previous = currentIndex > 0 ? collectionItems[currentIndex - 1] : null;
  const next = currentIndex < collectionItems.length - 1 ? collectionItems[currentIndex + 1] : null;
  const pathwayReferences = pathway.steps.map((step) => step.reference);
  const suggestions = pathwaySuggestions(pathway.slug);
  const appHref = buildAppUrl(`/paths/${pathway.appSlug}`, { origin: `website-pathway-${pathway.slug}` });

  return (
    <>
      <section className="pathway-hero">
        <div className="shell">
          <div className="pathway-hero-topline">
            <Link className="back-link back-link-light" href="/pathways"><ArrowLeft size={15} /> All pathways</Link>
            <span className="eyebrow eyebrow-light">{pathway.collection}</span>
          </div>
          <h1>{pathway.title}</h1>
          <p>{pathway.summary}</p>
          <div className="study-metrics"><span><Clock3 size={13} /> {pathway.estimatedMinutes} minutes</span><span>{pathway.steps.length} key steps</span><span>{pathway.level}</span></div>
        </div>
      </section>

      <section className="section">
        <div className="shell pathway-study-layout">
          <div className="pathway-timeline">
            {pathway.steps.map((step, index) => {
              const scripture = scriptures.find((item) => item.reference === step.reference || item.reference.startsWith(step.reference.replace(/–.*/, "")));
              return (
                <article className="pathway-study-step" key={`${step.reference}-${index}`}>
                  <div className="timeline-marker"><span>{String(index + 1).padStart(2, "0")}</span></div>
                  <div>
                    <span className="eyebrow">{step.reference}</span>
                    <h2>{step.title}</h2>
                    <p>{step.explanation}</p>
                    {scripture && <blockquote>“{scripture.text}”</blockquote>}
                    <div className="pathway-study-actions">
                      {scripture && <Link className="text-link" href={`/scripture/${scripture.path}`}>Study passage <ArrowRight size={15} /></Link>}
                      <BibleReferenceLink reference={step.reference} />
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          <aside className="pathway-summary-card">
            <span className="eyebrow eyebrow-light">Website preview</span>
            <h2>{pathway.title}</h2>
            <p>This page gives you the key biblical progression. Continue in the app for the full pathway, more passages, objections, branches, and deeper context.</p>
            {topic && <Link href={`/topics/${topic.slug}`}>Related topic: {topic.title}</Link>}
            <a className="button button-paper" href={appHref}>Continue this pathway in app <ExternalLink size={15} /></a>
          </aside>
        </div>
      </section>

      <section className="section section-tight"><div className="shell"><StudyScriptures references={pathwayReferences} /></div></section>
      <section className="section section-tight pathway-pagination-section">
        <div className="shell pathway-pagination">
          {previous ? <Link href={`/pathways/${previous.slug}`}><span>Previous in collection</span><strong><ArrowLeft size={17} /> {previous.title}</strong></Link> : <span />}
          {next ? <Link className="next" href={`/pathways/${next.slug}`}><span>Next in collection</span><strong>{next.title} <ArrowRight size={17} /></strong></Link> : <span />}
        </div>
      </section>
      <section className="section section-tight">
        <div className="shell">
          <section className="app-bridge app-bridge-compact" data-reveal>
            <div>
              <span className="eyebrow eyebrow-light">Continue this study in the app</span>
              <h2>Go deeper without turning this page into a textbook.</h2>
              <p>Open the exact {pathway.title} pathway for its complete passage sequence, objections, branches, and further context.</p>
            </div>
            <a className="button button-paper" href={appHref}>Open full pathway in app <ExternalLink size={17} /></a>
          </section>
        </div>
      </section>
      <section className="section section-tight"><div className="shell"><SmartNext currentPath={`/pathways/${pathway.slug}`} candidates={suggestions} eyebrow="Continue the pathway library" heading="Follow the next connected study." /></div></section>
    </>
  );
}
