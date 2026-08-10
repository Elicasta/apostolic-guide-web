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
    <span className="eyebrow">Growth Hub</span>
    <div className="growth-heading"><div><h1>Journeys</h1><p className="admin-lede">Design how people move from a first interaction into deeper study, follow-up, and long-term engagement.</p></div></div>

    <div className="people-metrics">
      <div><Route size={19}/><strong>{journeys.length}</strong><span>Journeys</span></div>
      <div><Sparkles size={19}/><strong>{active}</strong><span>Active</span></div>
      <div><Users size={19}/><strong>{enrolled}</strong><span>In progress</span></div>
    </div>

    <section className="admin-card publishing-card journey-create-card">
      <div className="card-heading"><div><span className="section-kicker">Create</span><h2>New journey</h2></div><p>Start with an entry trigger. You can build the full flow on the next screen.</p></div>
      <NewJourneyForm />
    </section>

    <section className="admin-card publishing-card">
      <div className="card-heading"><div><span className="section-kicker">Library</span><h2>Journey library</h2></div><p>Draft, active, paused, and archived relationship journeys.</p></div>
      {journeys.length ? <div className="content-library">{journeys.map((journey) => <Link className="content-library-row" key={journey.id} href={`/admin/journeys/${journey.id}`}>
        <div><span className="content-kind">{journey.trigger_type.replaceAll("_", " ")}</span><strong>{journey.name}</strong><small>{journey.steps.length} steps · {journey.enrollment_count} active enrollments</small></div>
        <div className="content-row-end"><span className={journey.status === "active" ? "status-pill" : "status-pill status-pending"}>{journey.status}</span><ArrowRight size={18}/></div>
      </Link>)}</div> : <div className="empty-state"><Route size={26}/><strong>No journeys yet.</strong><p>Create the first journey above. Nothing runs until you explicitly activate it.</p></div>}
    </section>
  </>;
}
