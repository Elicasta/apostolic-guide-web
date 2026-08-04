import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { answerBySlug, answers, scriptures, topicBySlug } from "@/data";
import { AppBridge, ContentBody, DatabaseDocument, PageHero, ScriptureMiniCard } from "@/components";
import { ScriptureContextNote, StudyScriptures } from "@/study-guidance";
import { ShareButton } from "@/share-button";
import { getDatabaseContent } from "@/database-content";

export function generateStaticParams() { return answers.map((answer) => ({ slug: answer.slug })); }

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const answer = answerBySlug(slug);
  const database = answer ? null : await getDatabaseContent("answer", slug);
  return answer ? { title: answer.question, description: answer.shortAnswer } : database ? { title: database.title, description: database.summary } : {};
}

export default async function AnswerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const answer = answerBySlug(slug);
  const database = answer ? null : await getDatabaseContent("answer", slug);
  if (!answer && !database) notFound();

  if (!answer && database) {
    return (
      <>
        <PageHero variant="answers" eyebrow="Direct answer" title={database.title} text={database.summary} />
        <section className="section"><div className="shell reading-layout"><div /><div><DatabaseDocument body={database.body} /><ShareButton title={database.title} contentKey={`answer:${slug}`} /><StudyScriptures /><AppBridge compact origin={`answer:${slug}`} /></div></div></section>
      </>
    );
  }

  const resolvedAnswer = answer!;
  const topic = topicBySlug(resolvedAnswer.topicSlug);
  const linked = resolvedAnswer.scriptures.map((reference) => scriptures.find((entry) => entry.reference === reference || reference.includes(entry.reference.split("–")[0]))).filter(Boolean);

  return (
    <section className="answer-detail-page">
      <div className="shell">
        <header className="content-header">
          <span className="eyebrow">Answer · {topic?.title}</span>
          <h1>{resolvedAnswer.question}</h1>
          <p className="lede">{resolvedAnswer.summary}</p>
          <ShareButton title={resolvedAnswer.question} contentKey={`answer:${resolvedAnswer.slug}`} />
        </header>
        <div className="answer-summary" data-reveal><strong>Direct answer</strong><p>{resolvedAnswer.shortAnswer}</p></div>
        <div className="topic-page-grid">
          <ContentBody sections={resolvedAnswer.sections} />
          <aside>
            <div className="sidebar-card">
              <h3>Key Scriptures</h3>
              {linked.map((entry) => entry && <ScriptureMiniCard key={entry.slug} reference={entry.reference} point={entry.mainPoint} href={`/scripture/${entry.path}`} />)}
              {linked.length === 0 && resolvedAnswer.scriptures.map((reference) => <div className="scripture-mini" key={reference}><span><strong>{reference}</strong></span></div>)}
              <ScriptureContextNote />
            </div>
            {topic && (
              <div className="sidebar-card related-topic-card">
                <span className="eyebrow">Related topic</span>
                <h3>{topic.title}</h3>
                <p>{topic.claim}</p>
                <Link className="text-link" href={`/topics/${topic.slug}`}>Explore topic <ArrowRight size={16} /></Link>
              </div>
            )}
          </aside>
        </div>
        <StudyScriptures references={resolvedAnswer.scriptures} />
        <AppBridge compact origin={`answer:${resolvedAnswer.slug}`} />
      </div>
    </section>
  );
}
