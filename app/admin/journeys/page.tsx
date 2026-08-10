import Link from "next/link";
import { ArrowRight, Route, Sparkles, Users } from "lucide-react";
import { listJourneys, runDueJourneys } from "@/growth-journeys";
import { NewJourneyForm } from "@/journey-builder";

export default async function JourneysPage() {
  await runDueJourneys(100);
  const journeys = await listJourneys();
  const active = journeys.filter((j) => j.status === "active").length;
  const enrolled = journeys.reduce((sum, j) => sum + j.enrollment_count, 0);

  return <>
    <span className="eyebrow">Relationships</span>
    <div className="studio-page-heading"><div><h1>Journeys</h1><p className="admin-lede">Build and manage how people move from first interaction into study, follow-up, and continued engagement.</p></div></div>

    <div className="studio-kpi-grid studio-kpi-grid-three">
      <div className="studio-kpi"><Route size={19}/><span>Journeys</span><strong>{journeys.length}</strong><small>Saved relationship flows</small></div>
      <div className="studio-kpi"><Sparkles size={19}/><span>Active</span><strong>{active}</strong><small>Currently accepting people</small></div>
      <div className="studio-kpi"><Users size={19}/><span>In progress</span><strong>{enrolled}</strong><small>Active enrollments</small></div>
    </div>

    <section className="admin-card publishing-card journey-create-card">
      <div className="studio-section-head"><div><span className="section-kicker">Create</span><h2>New journey</h2></div><p>Choose an entry trigger, then build the full flow on the next screen.</p></div>
      <NewJourneyForm />
    </section>

    <section className="admin-card publishing-card studio-list-card">
      <div className="studio-section-head"><div><span className="section-kicker">Library</span><h2>Journey library</h2></div><span>{journeys.length} total</span></div>
      {journeys.length ? <div className="content-library studio-list">{journeys.map((journey) => <Link className="content-library-row studio-list-row" key={journey.id} href={`/admin/journeys/${journey.id}`}>
        <div><span className="content-kind">{journey.trigger_type.replaceAll("_", " ")}</span><strong>{journey.name}</strong><small>{journey.steps.length} steps · {journey.enrollment_count} active enrollments</small></div>
        <div className="content-row-end"><span className={journey.status === "active" ? "status-pill" : "status-pill status-pending"}>{journey.status}</span><ArrowRight size={18}/></div>
      </Link>)}</div> : <div className="empty-state"><Route size={26}/><strong>No journeys yet.</strong><p>Create the first journey above. Nothing runs until you explicitly activate it.</p></div>}
    </section>
  </>;
}
