import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, BookOpen } from "lucide-react";
import { notFound } from "next/navigation";
import { AppBridge, PageHero, ScriptureMiniCard, SearchForm } from "@/components";
import { answers, articles, scriptureByPath, scriptures, topicBySlug } from "@/data";

type Props = { params: Promise<{ path?: string[] }> };

export function generateStaticParams() { return scriptures.map((entry) => ({ path: entry.path.split("/") })); }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const path = (await params).path?.join("/");
  if (!path) return { title: "Scripture", description: "Browse Scripture passages with context, main points, and apostolic connections." };
  const entry = scriptureByPath(path);
  return entry ? { title: entry.reference, description: entry.mainPoint } : {};
}

export default async function ScripturePage({ params }: Props) {
  const path = (await params).path?.join("/");

  if (!path) {
    const groups = Object.entries(Object.groupBy(scriptures, (entry) => entry.topicSlugs[0] ?? "other"));
    return <><PageHero eyebrow="Open the text" title="Scripture library" text="Read each passage with its context, main point, apostolic connection, related texts, and the misunderstanding to avoid." /><section className="section"><div className="shell"><SearchForm compact /><div className="scripture-directory">{groups.map(([topicSlug, entries]) => { const topic = topicBySlug(topicSlug); return <section key={topicSlug}><div className="directory-section-heading"><span className="eyebrow">{topic?.category ?? "Scripture"}</span><h2>{topic?.title ?? "Related passages"}</h2></div><div className="scripture-library">{entries?.map((entry) => <ScriptureMiniCard key={entry.slug} reference={entry.reference} point={entry.mainPoint} href={`/scripture/${entry.path}`} />)}</div></section>; })}</div></div></section></>;
  }

  const entry = scriptureByPath(path);
  if (!entry) notFound();
  const topicLinks = entry.topicSlugs.map(topicBySlug).filter(Boolean);
  const relatedAnswers = answers.filter((answer) => answer.scriptures.some((reference) => reference.includes(entry.reference.split("–")[0]))).slice(0, 3);
  const relatedArticles = articles.filter((article) => entry.topicSlugs.includes(article.topicSlug)).slice(0, 3);

  return (
    <>
      <section className="scripture-page-hero"><div className="shell"><Link className="back-link back-link-light" href="/scripture"><ArrowLeft size={16} /> Scripture library</Link><div className="scripture-reference"><BookOpen size={18} /> {entry.reference}<span>{entry.translation}</span></div><blockquote>{entry.text}</blockquote><p>{entry.mainPoint}</p></div></section>
      <section className="section"><div className="shell scripture-detail-grid"><article className="prose-content scripture-prose"><section><span className="eyebrow">Context</span><h2>What is happening in the passage?</h2><p>{entry.context}</p></section><section><span className="eyebrow">Main point</span><h2>What does the text establish?</h2><p>{entry.mainPoint}</p></section><section><span className="eyebrow">Apostolic connection</span><h2>How does it connect?</h2><p>{entry.apostolicConnection}</p></section>{entry.misunderstanding && <section className="callout"><span>Do not miss this</span><h2>Common misunderstanding</h2><p>{entry.misunderstanding}</p></section>}<AppBridge compact origin={`scripture:${entry.slug}`} /></article><aside className="scripture-sidebar"><div><strong>Topics</strong>{topicLinks.map((topic) => topic && <Link href={`/topics/${topic.slug}`} key={topic.slug}>{topic.title}<ArrowRight size={14} /></Link>)}</div><div><strong>Related passages</strong>{entry.related.map((reference) => { const linked = scriptures.find((item) => item.reference === reference); return linked ? <Link href={`/scripture/${linked.path}`} key={reference}>{reference}<ArrowRight size={14} /></Link> : <span key={reference}>{reference}</span>; })}</div>{relatedAnswers.length > 0 && <div><strong>Related answers</strong>{relatedAnswers.map((answer) => <Link href={`/answers/${answer.slug}`} key={answer.slug}>{answer.question}<ArrowRight size={14} /></Link>)}</div>}{relatedArticles.length > 0 && <div><strong>Related studies</strong>{relatedArticles.map((article) => <Link href={`/articles/${article.slug}`} key={article.slug}>{article.title}<ArrowRight size={14} /></Link>)}</div>}</aside></div></section>
    </>
  );
}
