import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, BookOpen, ExternalLink, HelpCircle, Route } from "lucide-react";
import { notFound } from "next/navigation";
import { AppBridge, PageHero, ScriptureMiniCard, TopicCard } from "@/components";
import { ScriptureContextNote, StudyScriptures } from "@/study-guidance";
import { SmartNext } from "@/smart-next";
import { topicSuggestions } from "@/suggestion-data";
import { answers, articles, scriptures, topicBySlug, topics } from "@/data";
import { allPathways } from "@/pathway-catalog";
import { buildAppUrl } from "@/urls";

export function generateStaticParams() { return topics.map((topic) => ({ slug: topic.slug })); }

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const topic = topicBySlug(slug);
  if (!topic) return {};
  return { title: topic.title, description: topic.claim };
}

export default async function TopicPage({ params }: Props) {
  const { slug } = await params;
  const topic = topicBySlug(slug);
  if (!topic) notFound();

  const topicScriptures = scriptures.filter((item) => item.topicSlugs.includes(topic.slug));
  const topicAnswers = answers.filter((item) => item.topicSlug === topic.slug);
  const topicArticles = articles.filter((item) => item.topicSlug === topic.slug);
  const topicPathway = allPathways.find((item) => item.topicSlug === topic.slug);
  const relatedTopics = topics.filter((item) => item.slug !== topic.slug && item.category === topic.category).slice(0, 2);
  const suggestions = topicSuggestions(topic.slug);
  const appPathwayHref = topicPathway
    ? buildAppUrl(`/paths/${topicPathway.appSlug}`, { origin: `website-topic-${topic.slug}` })
    : null;

  return (
    <>
      <PageHero eyebrow={topic.category} title={topic.title} text={topic.summary} />
      <section className="section">
        <div className="shell topic-page-grid">
          <div>
            <Link className="back-link" href="/topics"><ArrowLeft size={15} /> All topics</Link>
            <p className="topic-claim">{topic.claim}</p>

            <div className="topic-section-block">
              <span className="eyebrow">The biblical starting point</span>
              <h2>Key Scriptures</h2>
              <div className="scripture-library topic-scripture-list">
                {topicScriptures.length ? topicScriptures.map((item) => <ScriptureMiniCard href={`/scripture/${item.path}`} point={item.mainPoint} reference={item.reference} key={item.slug} />) : topic.keyScriptures.map((reference) => <div className="scripture-mini" key={reference}><BookOpen size={19} /><span><strong>{reference}</strong><small>Included in the growing Scripture library.</small></span></div>)}
              </div>
              <ScriptureContextNote />
            </div>

            {topicAnswers.length > 0 && <div className="topic-section-block"><span className="eyebrow">Common questions</span><h2>Answer the real objection.</h2><div className="topic-link-list">{topicAnswers.map((answer) => <Link href={`/answers/${answer.slug}`} key={answer.slug}><HelpCircle size={18} /><span><strong>{answer.question}</strong><small>{answer.shortAnswer}</small></span><ArrowRight size={16} /></Link>)}</div></div>}

            {topicArticles.length > 0 && <div className="topic-section-block"><span className="eyebrow">Go deeper</span><h2>Related articles</h2><div className="topic-link-list">{topicArticles.map((article) => <Link href={`/articles/${article.slug}`} key={article.slug}><BookOpen size={18} /><span><strong>{article.title}</strong><small>{article.summary}</small></span><ArrowRight size={16} /></Link>)}</div></div>}
          </div>

          <aside className="topic-sidebar">
            <div className="sidebar-card"><span className="eyebrow">Study summary</span><h3>{topic.title}</h3><p>{topic.summary}</p><div className="scripture-chip-row">{topic.keyScriptures.map((reference) => <span key={reference}>{reference}</span>)}</div></div>
            {topicPathway && <div className="sidebar-card sidebar-card-dark"><Route size={23} /><span className="eyebrow eyebrow-light">Guided pathway</span><h3>{topicPathway.title}</h3><p>{topicPathway.summary}</p><Link className="button button-paper" href={`/pathways/${topicPathway.slug}`}>Begin study <ArrowRight size={16} /></Link>{appPathwayHref && <a className="text-link" href={appPathwayHref}>Open full path in app <ExternalLink size={15} /></a>}</div>}
          </aside>
        </div>
      </section>

      <section className="section section-tight"><div className="shell"><StudyScriptures references={topic.keyScriptures} /></div></section>
      {relatedTopics.length > 0 && <section className="section section-tight related-section"><div className="shell"><span className="eyebrow">Keep studying</span><h2 className="related-heading">Related topics</h2><div className="topic-grid topic-grid-two">{relatedTopics.map((item) => <TopicCard topic={item} key={item.slug} />)}</div></div></section>}
      <section className="section section-tight"><div className="shell"><AppBridge origin={`topic-${topic.slug}`} compact /></div></section>
      <section className="section section-tight"><div className="shell"><SmartNext currentPath={`/topics/${topic.slug}`} candidates={suggestions} /></div></section>
    </>
  );
}
