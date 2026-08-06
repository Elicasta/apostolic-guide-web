import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, BookOpen, Clock3, ExternalLink, Play } from "lucide-react";
import { notFound } from "next/navigation";
import { classLessons } from "@/classes";

export function generateStaticParams() {
  return classLessons.map((lesson) => ({ slug: lesson.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const lesson = classLessons.find((item) => item.slug === slug);
  return lesson ? { title: lesson.title, description: lesson.summary } : {};
}

export default async function ClassDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const lesson = classLessons.find((item) => item.slug === slug);
  if (!lesson) notFound();

  return (
    <article className="class-detail">
      <header className="class-detail-hero">
        <div className="shell">
          <Link className="back-link" href="/library"><ArrowLeft size={16} /> Class Library</Link>
          <span className="eyebrow eyebrow-light">{lesson.series}</span>
          <h1>{lesson.title}</h1>
          <p>{lesson.summary}</p>
          <div className="class-detail-meta"><span>{lesson.teacher}</span><span><Clock3 size={14} /> {lesson.durationMinutes} minutes</span><span>{lesson.publishedAt}</span></div>
        </div>
      </header>
      <section className="section">
        <div className="shell class-detail-grid">
          <div>
            <div className="class-player-placeholder">
              <span><Play size={32} fill="currentColor" /></span>
              <div><strong>Mock class replay</strong><p>Add the YouTube video ID from the control dashboard after the first livestream.</p></div>
            </div>
            <div className="class-notes">
              <span className="eyebrow">Class overview</span>
              <h2>Open the text while you watch.</h2>
              <p>{lesson.description}</p>
              <p>This class begins with the confession that God is one, follows the Word into the incarnation, and lets Jesus explain the Father-Son relationship in John 14.</p>
            </div>
          </div>
          <aside className="class-scriptures">
            <span className="eyebrow">Key Scriptures</span>
            <h2>Read these passages.</h2>
            {lesson.scriptureReferences.map((reference) => (
              <Link href={`/search?q=${encodeURIComponent(reference)}`} key={reference}><BookOpen size={17} /><span>{reference}</span><ExternalLink size={14} /></Link>
            ))}
            <Link className="button button-dark" href="/pathways">Continue with a pathway</Link>
          </aside>
        </div>
      </section>
    </article>
  );
}
