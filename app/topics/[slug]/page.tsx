import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, CircleHelp, FileText, Route } from "lucide-react";
import { notFound } from "next/navigation";
import { AppBridge, DatabaseDocument, ScriptureMiniCard } from "@/components";
import { answers, articles, pathways, scriptures, topicBySlug, topics } from "@/data";
import { getDatabaseContent } from "@/database-content";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() { return topics.map((topic) => ({ slug: topic.slug })); }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const local = topicBySlug(slug);
  const database = local ? null : await getDatabaseContent("topic", slug);
  return local ? { title: local.title, description: local.claim } : database ? { title: database.title, description: database.summary } : {};
}

export default async function TopicPage({ params }: Props) {
  const { slug } = await params;
  const topic = topicBySlug(slug);
  const database = topic ? null : await getDatabaseContent("topic", slug);
  if (!topic && !database) notFound();

  if (!topic && database) {
    return <><section className="topic-hero"><div className="shell"><span className="eyebrow eyebrow-light">Published topic</span><h1>{database.title}</h1><p>{database.summary}</p></div></section><section className="section"><div className="shell reading-layout"><div /><div><DatabaseDocument body={database.body} /><AppBridge compact origin={`topic:${slug}`} /></div></div></section></>;
  }

  const resolved = topic!;
  const relatedAnswers = answers.filter((item) => item.topicSlug === resolved.slug);
  const relatedArticles = articles.filter((item) => item.topicSlug === resolved.slug);
  const relatedScriptures = scriptures.filter((item) => item.topicSlugs.includes(resolved.slug));
  const relatedPathways = pathways.filter((item) => item.topicSlug === resolved.slug);

  return (
    <>
      <section className="topic-hero"><div className="shell"><span className="eyebrow eyebrow-light">{resolved.category}</span><h1>{resolved.title}</h1><p>{resolved.claim}</p></div></section>
      <section className="section">
        <div className="shell topic-page-grid">
          <article className="topic-main">
            <div className="topic-summary"><span className="eyebrow">The claim</span><h2>{resolved.claim}</h2><p>{resolved.summary}</p></div>
            <section className="content-section"><div className="content-section-heading"><BookOpen size={20} /><div><h2>Key Scriptures</h2><p>Start with the passages that establish the argument.</p></div></div><div className="scripture-library">{relatedScriptures.map((entry) => <ScriptureMiniCard key={entry.slug} reference={entry.reference} point={entry.mainPoint} href={`/scripture/${entry.path}`} />)}</div></section>
            {relatedAnswers.length > 0 && <section className="content-section"><div className="content-section-heading"><CircleHelp size={20} /><div><h2>Questions this topic answers</h2><p>Use the direct response first, then trace the evidence.</p></div></div><div className="list-stack compact-list">{relatedAnswers.map((answer) => <Link className="list-row" href={`/answers/${answer.slug}`} key={answer.slug}><span className="kind">Answer</span><div><h3>{answer.question}</h3><p>{answer.shortAnswer}</p></div><ArrowRight size={18} /></Link>)}</div></section>}
            {relatedArticles.length > 0 && <section className="content-section"><div className="content-section-heading"><FileText size={20} /><div><h2>Related studies</h2><p>Read the longer argument and passage context.</p></div></div><div className="list-stack compact-list">{relatedArticles.map((article) => <Link className="list-row" href={`/articles/${article.slug}`} key={article.slug}><span className="kind">Article</span><div><h3>{article.title}</h3><p>{article.summary}</p></div><ArrowRight size={18} /></Link>)}</div></section>}
          </article>
          <aside className="topic-sidebar">
            <div className="sidebar-card"><span className="eyebrow">Foundation</span><h3>Key references</h3>{resolved.keyScriptures.map((reference) => <span className="plain-reference" key={reference}>{reference}</span>)}</div>
            {relatedPathways.length > 0 && <div className="sidebar-card"><Route size={20} /><h3>Follow the pathway</h3>{relatedPathways.map((pathway) => <Link className="sidebar-link" href={`/pathways/${pathway.slug}`} key={pathway.slug}><span><strong>{pathway.title}</strong><small>{pathway.estimatedMinutes} min</small></span><ArrowRight size={16} /></Link>)}</div>}
          </aside>
        </div>
      </section>
      <section className="section section-tight"><div className="shell"><AppBridge origin={`topic:${resolved.slug}`} /></div></section>
    </>
  );
}
