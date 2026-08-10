import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Instagram, Mail, MessageCircle, MousePointerClick, Route, Tag, UserRound, UserRoundCheck } from "lucide-react";
import { getPerson, personLabel } from "@/people-crm";
import { PersonProfileActions } from "@/person-profile-actions";

function eventIcon(type: string) {
  if (type === "comment") return <MessageCircle size={16}/>;
  if (type === "message") return <Instagram size={16}/>;
  if (type.includes("email")) return <Mail size={16}/>;
  if (type.includes("app") || type.includes("click")) return <MousePointerClick size={16}/>;
  return <UserRound size={16}/>;
}

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = await getPerson(id);
  if (!record) notFound();
  const { person, events, tags, notes, journeys } = record;

  return <>
    <Link className="people-back" href="/admin/people"><ArrowLeft size={16}/> People</Link>
    <div className="person-profile-hero">
      <div className="person-profile-avatar">{personLabel(person).replace(/^@/, "").slice(0, 1).toUpperCase()}</div>
      <div className="person-profile-title"><span className="eyebrow">Person</span><h1>{personLabel(person)}</h1><p>{person.instagram_username ? `@${person.instagram_username}` : person.email ?? "Identity captured from activity"}</p></div>
      <div className="person-profile-badges"><span className="status-pill">{person.source}</span><span className={person.status === "subscriber" || person.status === "app_user" ? "status-pill" : "status-pill status-pending"}>{person.status.replace("_", " ")}</span></div>
    </div>

    <div className="person-profile-grid">
      <main className="person-profile-main">
        <section className="admin-card publishing-card">
          <div className="card-heading"><div><span className="section-kicker">Timeline</span><h2>Relationship history</h2></div><p>Events from connected channels appear here without storing private message bodies.</p></div>
          {events.length ? <div className="person-timeline">{events.map((event) => <div className="person-timeline-item" key={event.id}><div className="person-timeline-icon">{eventIcon(event.event_type)}</div><div><strong>{event.event_name ?? event.event_type.replaceAll("_", " ")}</strong><span>{event.channel} · {new Date(event.occurred_at).toLocaleString()}</span>{Object.keys(event.metadata ?? {}).length ? <small>{Object.entries(event.metadata).map(([k,v]) => `${k.replaceAll("_", " ")}: ${String(v)}`).join(" · ")}</small> : null}</div></div>)}</div> : <div className="empty-state"><UserRound size={24}/><strong>No timeline events yet.</strong><p>New interactions will append to this person automatically.</p></div>}
        </section>

        <section className="admin-card publishing-card">
          <div className="card-heading"><div><span className="section-kicker">Notes</span><h2>Private ministry notes</h2></div></div>
          {notes.length ? <div className="person-notes">{notes.map((note) => <article key={String(note.id)}><p>{String(note.note)}</p><small>{note.created_by ? `${note.created_by} · ` : ""}{new Date(String(note.created_at)).toLocaleString()}</small></article>)}</div> : <div className="empty-state"><UserRoundCheck size={24}/><strong>No notes yet.</strong><p>Add follow-up context from the profile controls.</p></div>}
        </section>
      </main>

      <aside className="person-profile-sidebar">
        <section className="admin-card person-summary-card"><span className="section-kicker">Profile</span><dl><div><dt>First seen</dt><dd>{new Date(person.first_seen_at).toLocaleString()}</dd></div><div><dt>Last active</dt><dd>{new Date(person.last_seen_at).toLocaleString()}</dd></div><div><dt>Source</dt><dd>{person.source_detail ?? person.source}</dd></div><div><dt>Email</dt><dd>{person.email ?? "Not linked"}</dd></div><div><dt>Instagram</dt><dd>{person.instagram_username ? `@${person.instagram_username}` : person.instagram_user_id ? `ID ${person.instagram_user_id.slice(-8)}` : "Not linked"}</dd></div></dl></section>

        <section className="admin-card person-summary-card"><span className="section-kicker">Tags</span>{tags.length ? <div className="person-tag-list">{tags.map((item) => <span key={String(item.tag)}><Tag size={12}/>{String(item.tag)}</span>)}</div> : <p className="person-muted">No tags yet.</p>}</section>

        <section className="admin-card person-summary-card"><span className="section-kicker">Journeys</span>{journeys.length ? <div className="person-journeys">{journeys.map((journey) => <div key={String(journey.id)}><Route size={15}/><div><strong>{String(journey.journey_name)}</strong><small>{String(journey.stage_name ?? journey.status)}</small></div></div>)}</div> : <p className="person-muted">No journey assigned yet.</p>}</section>

        <section className="admin-card person-summary-card"><span className="section-kicker">Manage</span><PersonProfileActions personId={person.id} status={person.status}/></section>
      </aside>
    </div>
  </>;
}
