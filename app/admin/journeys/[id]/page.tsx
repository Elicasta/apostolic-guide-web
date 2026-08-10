import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Clock3, Users } from "lucide-react";
import { getStudioPermission } from "@/auth";
import { getJourney } from "@/growth-journeys";
import { JourneyEditor } from "@/journey-builder";

export default async function JourneyPage({ params }: { params: Promise<{ id: string }> }) {
  const permission = await getStudioPermission("view_journeys");
  if (!permission.allowed && permission.access.state !== "unconfigured") redirect("/admin");
  const { id } = await params;
  const record = await getJourney(id);
  if (!record) notFound();
  const active = record.enrollments.filter((e) => ["active","waiting","paused"].includes(String(e.status))).length;
  const completed = record.enrollments.filter((e) => e.status === "completed").length;

  return <>
    <Link className="people-back" href="/admin/journeys"><ArrowLeft size={16}/> Journeys</Link>
    <div className="growth-heading"><div><span className="eyebrow">Journey</span><h1>{record.journey.name}</h1><p className="admin-lede">Build the relationship flow, control entry conditions, and monitor who is currently moving through it.</p></div></div>
    <div className="people-metrics"><div><Users size={19}/><strong>{active}</strong><span>In progress</span></div><div><Clock3 size={19}/><strong>{record.enrollments.filter((e) => e.status === "waiting").length}</strong><span>Waiting</span></div><div><Users size={19}/><strong>{completed}</strong><span>Completed</span></div></div>
    <JourneyEditor journey={record.journey} initialSteps={record.steps}/>

    <section className="admin-card publishing-card journey-enrollment-card">
      <div className="card-heading"><div><span className="section-kicker">People</span><h2>Journey activity</h2></div><p>Current and recent enrollments for this journey.</p></div>
      {record.enrollments.length ? <div className="content-library">{record.enrollments.map((enrollment) => {
        const raw = enrollment.people as unknown as { id?: string; display_name?: string | null; instagram_username?: string | null; email?: string | null } | null;
        const label = raw?.display_name || (raw?.instagram_username ? `@${raw.instagram_username}` : raw?.email) || "Person";
        return <Link href={raw?.id ? `/admin/people/${raw.id}` : "#"} key={String(enrollment.id)} className="content-library-row"><div><span className="content-kind">{String(enrollment.status)}</span><strong>{label}</strong><small>Step {Number(enrollment.current_step_position) + 1}{enrollment.next_action_at ? ` · resumes ${new Date(String(enrollment.next_action_at)).toLocaleString()}` : ""}</small></div><div className="content-row-end"><span className={enrollment.status === "completed" ? "status-pill" : "status-pill status-pending"}>{String(enrollment.status)}</span></div></Link>;
      })}</div> : <div className="empty-state"><Users size={24}/><strong>No one has entered this journey yet.</strong><p>Activate a social trigger or enroll someone manually from their People profile.</p></div>}
    </section>
  </>;
}
