import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpen, Eye, Instagram, Mail, MessageCircle, MousePointerClick, Route, Search, Tag, UserRound, UserRoundCheck } from "lucide-react";
import { getPerson, personLabel } from "@/people-crm";
import { listJourneys } from "@/growth-journeys";
import { PersonProfileActions } from "@/person-profile-actions";
import { createServiceClient } from "@/supabase";

function eventIcon(type: string) {
  if (type === "comment") return <MessageCircle size={16}/>;
  if (type === "message") return <Instagram size={16}/>;
  if (type.includes("email")) return <Mail size={16}/>;
  if (type.includes("search")) return <Search size={16}/>;
  if (type.includes("article") || type.includes("pathway") || type.includes("scripture")) return <BookOpen size={16}/>;
  if (type.includes("app") || type.includes("click")) return <MousePointerClick size={16}/>;
  if (type.includes("page")) return <Eye size={16}/>;
  return <UserRound size={16}/>;
}

function analyticsLabel(name: string) {
  const labels: Record<string,string> = {
    page_viewed: "Viewed page", article_opened: "Opened article", article_completed: "Completed article",
    pathway_started: "Started pathway", pathway_step_completed: "Completed pathway step", scripture_opened: "Opened Scripture",
    topic_opened: "Opened topic", answer_opened: "Opened answer", search_submitted: "Searched Apostolic Guide",
    search_result_opened: "Opened search result", search_no_results: "Search returned no results", app_link_clicked: "Opened Apostolic Guide app",
    content_shared: "Shared content"
  };
  return labels[name] ?? name.replaceAll("_", " ");
}

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const service = createServiceClient();
  const [record, allJourneys, websiteResult] = await Promise.all([
    getPerson(id),
    listJourneys(),
    service ? service.schema("analytics").from("events").select("id,event_name,page_path,properties,utm_source,utm_campaign,occurred_at").eq("person_id", id).neq("event_name", "presence_heartbeat").order("occurred_at", { ascending: false }).limit(200) : Promise.resolve({ data: [] })
  ]);
  if (!record) notFound();
  const { person, events, tags, notes, journeys, identities } = record;
  const websiteEvents = websiteResult.data ?? [];
  const timeline = [
    ...events.map((event) => ({ id: `crm:${event.id}`, type: event.event_type, label: event.event_name ?? event.event_type.replaceAll("_", " "), channel: event.channel, at: event.occurred_at, detail: Object.entries(event.metadata ?? {}).map(([k,v]) => `${k.replaceAll("_", " ")}: ${String(v)}`).join(" · ") })),
    ...websiteEvents.map((event) => {
      const properties = (event.properties ?? {}) as Record<string,unknown>;
      const content = properties.contentKey ? String(properties.contentKey) : null;
      const query = properties.query ? String(properties.query) : null;
      const detail = [content, query ? `query: ${query}` : null, event.page_path ? String(event.page_path).split("?")[0] : null, event.utm_source ? `from ${event.utm_source}` : null].filter(Boolean).join(" · ");
      return { id: `web:${event.id}`, type: String(event.event_name), label: analyticsLabel(String(event.event_name)), channel: "website", at: String(event.occurred_at), detail };
    })
  ].sort((a,b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  const pageViews = websiteEvents.filter((event) => event.event_name === "page_viewed").length;
  const articles = new Set(websiteEvents.filter((event) => ["article_opened","article_completed"].includes(String(event.event_name))).map((event) => String((event.properties as Record<string,unknown> | null)?.contentKey ?? event.page_path))).size;
  const pathways = new Set(websiteEvents.filter((event) => ["pathway_started","pathway_step_completed"].includes(String(event.event_name))).map((event) => String((event.properties as Record<string,unknown> | null)?.contentKey ?? event.page_path))).size;
  const scriptures = websiteEvents.filter((event) => event.event_name === "scripture_opened").length;
  const appOpens = websiteEvents.filter((event) => event.event_name === "app_link_clicked").length;
  const availableJourneys = allJourneys.filter((j) => j.status !== "archived").map((j) => ({ id: j.id, name: j.name }));

  return <>
    <Link className="people-back" href="/admin/people"><ArrowLeft size={16}/> People</Link>
    <div className="person-profile-hero">
      <div className="person-profile-avatar">{personLabel(person).replace(/^@/, "").slice(0, 1).toUpperCase()}</div>
      <div className="person-profile-title"><span className="eyebrow">Person</span><h1>{personLabel(person)}</h1><p>{person.instagram_username ? `@${person.instagram_username}` : person.email ?? "Identity captured from activity"}</p></div>
      <div className="person-profile-badges"><span className="status-pill">{person.source}</span><span className={person.status === "subscriber" || person.status === "app_user" ? "status-pill" : "status-pill status-pending"}>{person.status.replace("_", " ")}</span></div>
    </div>

    <div className="person-engagement-strip">
      <div><Eye size={17}/><strong>{pageViews}</strong><span>Page views</span></div>
      <div><BookOpen size={17}/><strong>{articles}</strong><span>Articles</span></div>
      <div><Route size={17}/><strong>{pathways}</strong><span>Pathways</span></div>
      <div><BookOpen size={17}/><strong>{scriptures}</strong><span>Scriptures</span></div>
      <div><MousePointerClick size={17}/><strong>{appOpens}</strong><span>App opens</span></div>
    </div>

    <div className="person-profile-grid">
      <main className="person-profile-main">
        <section className="admin-card publishing-card">
          <div className="card-heading"><div><span className="section-kicker">Timeline 2.0</span><h2>Relationship history</h2></div><p>Social, email, website study activity, pathways, Scripture, searches, and app transitions in one chronological record.</p></div>
          {timeline.length ? <div className="person-timeline">{timeline.map((event) => <div className="person-timeline-item" key={event.id}><div className="person-timeline-icon">{eventIcon(event.type)}</div><div><strong>{event.label}</strong><span>{event.channel} · {new Date(event.at).toLocaleString()}</span>{event.detail ? <small>{event.detail}</small> : null}</div></div>)}</div> : <div className="empty-state"><UserRound size={24}/><strong>No timeline events yet.</strong><p>New interactions will append to this person automatically.</p></div>}
        </section>

        <section className="admin-card publishing-card">
          <div className="card-heading"><div><span className="section-kicker">Notes</span><h2>Private ministry notes</h2></div></div>
          {notes.length ? <div className="person-notes">{notes.map((note) => <article key={String(note.id)}><p>{String(note.note)}</p><small>{note.created_by ? `${note.created_by} · ` : ""}{new Date(String(note.created_at)).toLocaleString()}</small></article>)}</div> : <div className="empty-state"><UserRoundCheck size={24}/><strong>No notes yet.</strong><p>Add follow-up context from the profile controls.</p></div>}
        </section>
      </main>

      <aside className="person-profile-sidebar">
        <section className="admin-card person-summary-card"><span className="section-kicker">Profile</span><dl><div><dt>First seen</dt><dd>{new Date(person.first_seen_at).toLocaleString()}</dd></div><div><dt>Last active</dt><dd>{new Date(person.last_seen_at).toLocaleString()}</dd></div><div><dt>Source</dt><dd>{person.source_detail ?? person.source}</dd></div><div><dt>Email</dt><dd>{person.email ?? "Not linked"}</dd></div><div><dt>Instagram</dt><dd>{person.instagram_username ? `@${person.instagram_username}` : person.instagram_user_id ? `ID ${person.instagram_user_id.slice(-8)}` : "Not linked"}</dd></div></dl></section>
        <section className="admin-card person-summary-card"><span className="section-kicker">Identities</span>{identities.length ? <div className="person-identity-list">{identities.map((identity) => <div key={`${String(identity.provider)}:${String(identity.provider_user_id)}`}><strong>{String(identity.provider)}</strong><span>{identity.username ? `@${String(identity.username)}` : identity.email ? String(identity.email) : String(identity.provider_user_id)}</span></div>)}</div> : <p className="person-muted">No linked identities yet.</p>}</section>
        <section className="admin-card person-summary-card"><span className="section-kicker">Tags</span>{tags.length ? <div className="person-tag-list">{tags.map((item) => <span key={String(item.tag)}><Tag size={12}/>{String(item.tag)}</span>)}</div> : <p className="person-muted">No tags yet.</p>}</section>
        <section className="admin-card person-summary-card"><span className="section-kicker">Journeys</span>{journeys.length ? <div className="person-journeys">{journeys.map((enrollment) => { const journey = enrollment.growth_journeys as unknown as { id?: string; name?: string; status?: string } | null; return <Link href={journey?.id ? `/admin/journeys/${journey.id}` : "#"} key={String(enrollment.id)}><Route size={15}/><div><strong>{journey?.name ?? "Journey"}</strong><small>{String(enrollment.status)} · step {Number(enrollment.current_step_position) + 1}</small></div></Link>; })}</div> : <p className="person-muted">No journey assigned yet.</p>}</section>
        <section className="admin-card person-summary-card"><span className="section-kicker">Manage</span><PersonProfileActions personId={person.id} status={person.status} journeys={availableJourneys}/></section>
      </aside>
    </div>
  </>;
}
