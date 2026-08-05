import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Clock3, ExternalLink } from "lucide-react";
import { notFound } from "next/navigation";
import { BibleReferenceLink, StudyScriptures } from "@/study-guidance";
import { pathwayBySlug, pathways, scriptures, topicBySlug } from "@/data";
import { buildAppUrl } from "@/urls";

export function generateStaticParams() { return pathways.map((pathway) => ({ slug: pathway.slug })); }

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
  const currentIndex = pathways.findIndex((item) => item.slug === pathway.slug);
  const previous = currentIndex > 0 ? pathways[currentIndex - 1] : null;
  const next = currentIndex < pathways.length - 1 ? pathways[currentIndex + 1] : null;
  const pathwayReferences = pathway.steps.map((step) => step.reference);
  const appPath = `/pathways/${pathway.appSlug}`;
  const appHref = buildAppUrl(appPath, { origin: `website-pathway-${pathway.slug}` });

  return (
    <>
      <section className="pathway-hero">
        <div className="shell">
          <div className="pathway-hero-topline">
            <Link className="back-link back-link-light" href="/pathways"><ArrowLeft size={15} /> All pathways</Link>
            <span className="eyebrow eyebrow-light">Guided Scripture pathway</span>
          </div>
          <h1>{pathway.title}</h1>
          <p>{pathway.summary}</p>
          <div className="study-metrics"><span><Clock3 size={13} /> {pathway.estimatedMinutes} minutes</span><span>{pathway.steps.length} steps</span><span>{pathway.level}</span></div>
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
            <span className="eyebrow eyebrow-light">Pathway overview</span>
            <h2>{pathway.title}</h2>
            <p>{pathway.summary}</p>
            {topic && <Link href={`/topics/${topic.slug}`}>Related topic: {topic.title}</Link>}
            <a className="button button-paper" href={appHref}>Open this pathway in app <ExternalLink size={15} /></a>
          </aside>
        </div>
      </section>

      <section className="section section-tight"><div className="shell"><StudyScriptures references={pathwayReferences} /></div></section>
      <section className="section section-tight pathway-pagination-section">
        <div className="shell pathway-pagination">
          {previous ? <Link href={`/pathways/${previous.slug}`}><span>Previous pathway</span><strong><ArrowLeft size={17} /> {previous.title}</strong></Link> : <span />}
          {next ? <Link className="next" href={`/pathways/${next.slug}`}><span>Next pathway</span><strong>{next.title} <ArrowRight size={17} /></strong></Link> : <span />}
        </div>
      </section>
      <section className="section section-tight">
        <div className="shell">
          <section className="app-bridge app-bridge-compact" data-reveal>
            <div>
              <span className="eyebrow eyebrow-light">Continue in the study app</span>
              <h2>Continue this exact pathway.</h2>
              <p>Open {pathway.title} in Apostolic Guide and continue through the same guided sequence.</p>
            </div>
            <a className="button button-paper" href={appHref}>Open {pathway.title} <ExternalLink size={17} /></a>
          </section>
        </div>
      </section>
    </>
  );
}
