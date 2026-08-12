import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Clock3, ExternalLink } from "lucide-react";
import { notFound } from "next/navigation";
import { BibleReferenceLink, StudyScriptures } from "@/study-guidance";
import { SmartNext } from "@/smart-next";
import { PathwayStudyTracker } from "@/pathway-study-tracker";
import { PathwayAudioPlayer } from "@/pathway-audio-player";
import { getPathwayAudioAsset } from "@/pathway-audio";
import { pathwaySuggestions } from "@/suggestion-data";
import { scriptures, topicBySlug } from "@/data";
import { allPathways, pathwayBySlug } from "@/pathway-catalog";
import { buildAppUrl } from "@/urls";

export const revalidate = 60;

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
  const [topic, audioAsset] = await Promise.all([
    Promise.resolve(topicBySlug(pathway.topicSlug)),
    getPathwayAudioAsset(pathway.slug)
  ]);
  const collectionItems = allPathways.filter((item) => item.collection === pathway.collection);
  const currentIndex = collectionItems.findIndex((item) => item.slug === pathway.slug);
  const previous = currentIndex > 0 ? collectionItems[currentIndex - 1] : null;
  const next = currentIndex < collectionItems.length - 1 ? collectionItems[currentIndex + 1] : null;
  const pathwayReferences = pathway.steps.map((step) => step.reference);
  const suggestions = pathwaySuggestions(pathway.slug);
  const appHref = buildAppUrl(`/paths/${pathway.appSlug}`, { origin: `website-pathway-${pathway.slug}` });

  return (
    <>
      <PathwayStudyTracker slug={pathway.slug} stepCount={pathway.steps.length}/>
      <section className="pathway-hero">
        <div className="shell">
          <div className="pathway-hero-topline">
            <Link className="back-link back-link-light" href="/pathways"><ArrowLeft size={15} /> All pathways</Link>
            <span className="eyebrow eyebrow-light">{pathway.collection}</span>
          </div>
          <h1>{pathway.title}</h1>
          <p>{pathway.summary}</p>
          <div className="study-metrics"><span><Clock3 size={13} /> {pathway.estimatedMinutes} minutes</span><span>{pathway.steps.length} key steps</span><span>{pathway.level}</span></div>
          {audioAsset ? <PathwayAudioPlayer slug={pathway.slug} title={pathway.title} audioUrl={audioAsset.audioUrl}/> : null}
        </div>
      </section>

      <section className="section pathway-core-section">
        <div className="shell pathway-study-layout">
          <div className="pathway-timeline">
            {pathway.steps.map((step, index) => {
              const scripture = scriptures.find((item) => item.reference === step.reference || item.reference.startsWith(step.reference.replace(/–.*/, "")));
              return (
                <article className="pathway-study-step" data-pathway-step={index} data-pathway-reference={step.reference} key={`${step.reference}-${index}`}>
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

          <aside className="pathway-app-card">
            <span className="eyebrow eyebrow-light">Continue this study in the app</span>
            <h2>Open the complete {pathway.title} pathway.</h2>
            <p>Continue with the expanded passage sequence, common objections, study branches, and deeper context.</p>
            {topic && <Link className="pathway-app-topic" href={`/topics/${topic.slug}`}>Review topic: {topic.title}</Link>}
            <a className="button button-paper" href={appHref}>Open full pathway in app <ExternalLink size={16} /></a>
          </aside>
        </div>
      </section>

      <section className="section section-tight"><div className="shell"><StudyScriptures references={pathwayReferences} /></div></section>

      {(previous || next) && (
        <section className="section section-tight pathway-pagination-section">
          <nav className="shell pathway-sequence-nav" aria-label="Pathway collection navigation">
            {previous
              ? <Link href={`/pathways/${previous.slug}`}><ArrowLeft size={15} /><span><small>Previous</small><strong>{previous.title}</strong></span></Link>
              : <span />}
            {next
              ? <Link className="next" href={`/pathways/${next.slug}`}><span><small>Next</small><strong>{next.title}</strong></span><ArrowRight size={15} /></Link>
              : <span />}
          </nav>
        </section>
      )}

      <section className="section section-tight"><div className="shell"><SmartNext currentPath={`/pathways/${pathway.slug}`} candidates={suggestions} eyebrow="Continue the pathway library" heading="Follow the next connected study." /></div></section>
    </>
  );
}
