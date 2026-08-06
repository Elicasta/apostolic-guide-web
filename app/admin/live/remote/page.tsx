import Link from "next/link";
import { ArrowLeft, Radio, Square, Wifi } from "lucide-react";

export default function LiveRemotePage() {
  return (
    <>
      <Link className="back-link" href="/admin/live"><ArrowLeft size={16} /> Live Control</Link>
      <span className="eyebrow">Mobile remote</span>
      <h1>Remote</h1>
      <p className="admin-lede">A phone-friendly control surface for the public live state. These controls are intentionally disabled until Supabase persistence is connected.</p>
      <section className="remote-panel">
        <div className="remote-state"><Wifi size={22} /><span>Control service</span><strong>Setup required</strong></div>
        <button className="remote-live" type="button" disabled><Radio size={22} /> Start live</button>
        <button className="remote-end" type="button" disabled><Square size={20} /> End stream</button>
        <label>Public message<textarea defaultValue="We are preparing to begin." disabled /></label>
      </section>
    </>
  );
}
