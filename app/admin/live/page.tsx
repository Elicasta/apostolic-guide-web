import Link from "next/link";
import { ArrowRight, BookOpen, CircleDot, MonitorPlay, Radio, Settings2 } from "lucide-react";
import { classLessons } from "@/classes";

export default function LiveControlPage() {
  return (
    <>
      <span className="eyebrow">Teaching control</span>
      <h1>Live Control</h1>
      <p className="admin-lede">Prepare a lesson, connect its YouTube livestream, control the public live state, and publish the replay into the class library.</p>
      <div className="live-status-card">
        <div><span className="live-status-dot" /><div><small>Current broadcast</small><strong>Offline</strong></div></div>
        <button type="button" disabled>Go live</button>
      </div>
      <section className="live-control-grid">
        <Link href="/admin/live/remote"><Radio size={24} /><strong>Remote</strong><span>Start, end, and update the public live screen from a phone or tablet.</span><ArrowRight size={18} /></Link>
        <Link href="/admin/live/lessons"><BookOpen size={24} /><strong>Lessons</strong><span>Prepare class titles, Scriptures, notes, replay links, and publishing status.</span><ArrowRight size={18} /></Link>
        <div><MonitorPlay size={24} /><strong>OBS + YouTube</strong><span>Stream through OBS, record locally, then attach the YouTube replay after class.</span><CircleDot size={18} /></div>
        <div><Settings2 size={24} /><strong>V1 setup</strong><span>The controls are mocked safely. Supabase live-state persistence is the next implementation step.</span><CircleDot size={18} /></div>
      </section>
      <section className="admin-card">
        <h2>Class library status</h2>
        <table className="admin-table"><tbody>
          {classLessons.map((lesson) => <tr key={lesson.slug}><td>{lesson.title}</td><td>{lesson.status}</td><td><Link href={`/library/${lesson.slug}`}>View class</Link></td></tr>)}
        </tbody></table>
      </section>
    </>
  );
}
