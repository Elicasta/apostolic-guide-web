import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Clock3, Facebook, Instagram, Play, Youtube } from "lucide-react";
import { PageHero } from "@/components";
import { classLessons } from "@/classes";

export const metadata: Metadata = {
  title: "Class Library",
  description: "Watch previous Apostolic Guide classes and continue each lesson through Scripture, notes, and connected studies."
};

export default function LibraryPage() {
  return (
    <>
      <PageHero eyebrow="Teaching archive" title="Class Library" text="Watch previous classes, open the key Scriptures, and continue each lesson through connected pathways and articles." />
      <section className="section class-library-section">
        <div className="shell class-library-heading">
          <div><span className="eyebrow">Previous classes</span><h2>Study at your own pace.</h2></div>
          <p>For V1, livestreams can run through YouTube while OBS records a local master copy. The replay then becomes a structured class here.</p>
        </div>
        <div className="shell class-library-grid">
          {classLessons.map((lesson) => (
            <Link className="class-card" href={`/library/${lesson.slug}`} key={lesson.slug}>
              <div className="class-card-art"><span><Play size={24} fill="currentColor" /></span><small>Class replay</small></div>
              <div className="class-card-body">
                <span className="class-series">{lesson.series}</span>
                <h2>{lesson.title}</h2>
                <p>{lesson.summary}</p>
                <div className="class-card-meta"><span><Clock3 size={14} /> {lesson.durationMinutes} min</span><span>{lesson.publishedAt}</span></div>
                <span className="text-link">Open class <ArrowRight size={16} /></span>
              </div>
            </Link>
          ))}
        </div>
      </section>
      <section className="section section-tight library-social-section">
        <div className="shell library-social-card">
          <div><span className="eyebrow">Follow Apostolic Guide</span><h2>Classes, clips, and new studies.</h2></div>
          <nav aria-label="Apostolic Guide social links">
            <a href="https://www.youtube.com/@apostolicguide" target="_blank" rel="noreferrer"><Youtube size={20} /> YouTube</a>
            <a href="https://www.instagram.com/apostolicguide" target="_blank" rel="noreferrer"><Instagram size={20} /> Instagram</a>
            <a href="https://www.facebook.com/apostolicguide" target="_blank" rel="noreferrer"><Facebook size={20} /> Facebook</a>
          </nav>
        </div>
      </section>
    </>
  );
}
