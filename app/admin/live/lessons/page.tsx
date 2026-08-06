import Link from "next/link";
import { ArrowLeft, ArrowRight, Plus } from "lucide-react";
import { classLessons } from "@/classes";

export default function LiveLessonsPage() {
  return (
    <>
      <Link className="back-link" href="/admin/live"><ArrowLeft size={16} /> Live Control</Link>
      <span className="eyebrow">Teaching library</span>
      <h1>Lessons</h1>
      <p className="admin-lede">Prepare upcoming classes and publish completed YouTube replays into the public library.</p>
      <div className="lesson-toolbar"><button type="button" disabled><Plus size={17} /> New lesson</button><small>Creation will unlock when the Supabase classes table is connected.</small></div>
      <section className="lesson-admin-list">
        {classLessons.map((lesson) => (
          <article key={lesson.slug}>
            <div><span>{lesson.series}</span><h2>{lesson.title}</h2><p>{lesson.summary}</p></div>
            <div><strong>{lesson.status}</strong><Link href={`/library/${lesson.slug}`}>Open replay <ArrowRight size={16} /></Link></div>
          </article>
        ))}
      </section>
    </>
  );
}
