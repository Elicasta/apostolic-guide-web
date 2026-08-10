import Link from "next/link";
import { Activity, ArrowRight, Instagram, Search, UserRoundCheck, Users } from "lucide-react";
import { getPeopleMetrics, listPeople, personLabel } from "@/people-crm";

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ q?: string; source?: string; status?: string }> }) {
  const params = await searchParams;
  const [people, metrics] = await Promise.all([
    listPeople({ query: params.q, source: params.source, status: params.status, limit: 150 }),
    getPeopleMetrics()
  ]);

  return (
    <>
      <span className="eyebrow">Growth Hub</span>
      <div className="people-heading">
        <div><h1>People</h1><p className="admin-lede">One relationship record across Instagram, email, the website, and the app. Social interactions now create people automatically.</p></div>
      </div>

      <div className="people-metrics">
        <div><Users size={19}/><strong>{metrics.total}</strong><span>People</span></div>
        <div><Instagram size={19}/><strong>{metrics.instagram}</strong><span>From Instagram</span></div>
        <div><UserRoundCheck size={19}/><strong>{metrics.subscribers}</strong><span>Subscribers</span></div>
        <div><Activity size={19}/><strong>{metrics.active7d}</strong><span>Active 7 days</span></div>
      </div>

      <section className="admin-card people-directory-card">
        <form className="people-filters" method="get">
          <label className="people-search"><Search size={17}/><input name="q" defaultValue={params.q ?? ""} placeholder="Search name, Instagram, or email" /></label>
          <select name="source" defaultValue={params.source ?? "all"}><option value="all">All sources</option><option value="instagram">Instagram</option><option value="website">Website</option><option value="email">Email</option><option value="app">App</option></select>
          <select name="status" defaultValue={params.status ?? "all"}><option value="all">All statuses</option><option value="lead">Lead</option><option value="subscriber">Subscriber</option><option value="app_user">App user</option><option value="inactive">Inactive</option><option value="archived">Archived</option></select>
          <button className="button button-outline" type="submit">Filter</button>
        </form>

        {people.length ? <div className="people-list">{people.map((person) => <Link href={`/admin/people/${person.id}`} className="person-row" key={person.id}>
          <div className="person-avatar">{personLabel(person).replace(/^@/, "").slice(0, 1).toUpperCase()}</div>
          <div className="person-main"><strong>{personLabel(person)}</strong><span>{person.email ?? (person.instagram_user_id ? `Instagram ID ${person.instagram_user_id.slice(-8)}` : "No contact identity")}</span></div>
          <div className="person-source"><span>{person.source}</span><small>{person.source_detail ?? "First touch"}</small></div>
          <div className="person-status"><span className={person.status === "subscriber" || person.status === "app_user" ? "status-pill" : "status-pill status-pending"}>{person.status.replace("_", " ")}</span><small>Seen {new Date(person.last_seen_at).toLocaleDateString()}</small></div>
          <ArrowRight size={17}/>
        </Link>)}</div> : <div className="empty-state"><Users size={26}/><strong>No people match this view.</strong><p>New Instagram comments and DMs will create person records automatically. Email and app identity linking comes next.</p></div>}
      </section>
    </>
  );
}
