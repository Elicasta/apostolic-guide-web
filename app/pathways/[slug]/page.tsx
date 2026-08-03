import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Clock3 } from "lucide-react";
import { notFound } from "next/navigation";
import { AppBridge } from "@/components";
import { pathwayBySlug, pathways, scriptures, topicBySlug } from "@/data";
import { buildAppUrl } from "@/urls";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() { return pathways.map((pathway) => ({ slug: pathway.slug })); }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const pathway = pathwayBySlug((await params).slug);
  return pathway ? { title: pathway.title, description: pathway.summary } : {};
}

export default async function PathwayPage({ params }: Props) {
  const pathway = pathwayBySlug((await params).slug);
  if (!pathway) notFound();
  const topic = topicBySlug(pathway.topicSlug);

  return (
    <>
      <section className="pathway-hero"><div className="shell"><Link className="back-link back-link-light" href="/pathways"><ArrowLeft size={16} /> All pathways</Link><span className="eyebrow eyebrow-light">{topic?.title ?? "Guided study"}</span><h1>{pathway.title}</h1><p>{pathway.summary}</p><div className="pathway-hero-meta"><span><Clock3 size={15} /> {pathway.estimatedMinutes} minutes</span><span>{pathway.level}</span><span>{pathway.steps.length} steps</span></div></div></section>
      <section className="section"><div className="shell pathway-study-layout"><div className="pathway-timeline">{pathway.steps.map((step, index) => { const entry = scriptures.find((item) => item.reference === step.reference); return <article className="pathway-study-step" key={`${step.reference}-${index}`}><div className="timeline-marker"><span>{index + 1}</span></div><div><span className="eyebrow">{step.reference}</span><h2>{step.title}</h2><p>{step.explanation}</p>{entry && <blockquote>{entry.text}</blockquote>}{entry && <Link className="text-link" href={`/scripture/${entry.path}`}>Study {entry.reference} <ArrowRight size={16} /></Link>}</div></article>; })}</div><aside className="pathway-summary-card"><span className="eyebrow eyebrow-light">Continue studying</span><h2>Use this pathway in the app.</h2><p>Open the full study workspace to search related passages, save notes, and prepare for a conversation or presentation.</p><a className="button button-paper" href={buildAppUrl(`/pathways/${pathway.appSlug}`, { origin: `pathway:${pathway.slug}` })}>Open in app <ArrowRight size={16} /></a>{topic && <Link href={`/topics/${topic.slug}`}>Explore {topic.title}</Link>}</aside></div></section>
      <section className="section section-tight"><div className="shell"><AppBridge compact origin={`pathway:${pathway.slug}`} /></div></section>
    </>
  );
}
