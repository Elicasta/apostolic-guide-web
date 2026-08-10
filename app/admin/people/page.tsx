import Link from "next/link";
import { Activity, ArrowRight, Instagram, ListFilter, Search, UserRoundCheck, Users } from "lucide-react";
import { getPeopleMetrics, listPeople, personLabel } from "@/people-crm";

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ q?: string; source?: string; status?: string }> }) {
  const params = await searchParams;
  const [people, metrics] = await Promise.all([
    listPeople({ query: params.q, source: params.source, status: params.status, limit: 150 }),
    getPeopleMetrics()
  ]);

  return (
    <>
      <span className="eyebrow">Relationships</span>
      <div className="studio-page-heading">
        <div><h1>People</h1><p className="admin-lede">One relationship record across Instagram, email, website activity, and the app.</p></div>
        <Link className="button button-outline" href="/admin/segments"><ListFilter size={16}/> View segments</Link>
      </div>

      <div className="studio-kpi-grid studio-kpi-grid-four people-metrics">
        <div className="studio-kpi"><Users size={19}/><span>People</span><strong>{metrics.total}</strong><small>Known relationship records</small></div>
        <div className="studio-kpi"><Instagram size={19}/><span>Instagram</span><strong>{metrics.instagram}</strong><small>Identified from social</small></div>
        <div className="studio-kpi"><UserRoundCheck size={19}/><span>Subscribers</span><strong>{metrics.subscribers}</strong><small>Email subscribers</small></div>
        <div className="studio-kpi"><Activity size={19}/><span>Active 7 days</span><strong>{metrics.active7d}</strong><small>Recent relationship activity</small></div>
      </div>

      <section className="admin-card people-directory-card studio-list-card">
        <div className="studio-section-head"><div><span className="section-kicker">Directory</span><h2>Relationship records</h2></div><span>{people.length} shown</span></div>
        <form className="people-filters studio-filter-bar" method="get">
          <label className="people-search studio-search"><Search size={17}/><input name="q" defaultValue={params.q ?? ""} placeholder="Search name, Instagram, or email" /></label>
          <select name="source" defaultValue={params.source ?? "all"}><option value="all">All sources</option><option value="instagram">Instagram</option><option value="website">Website</option><option value="email">Email</option><option value="app">App</option></select>
          <select name="status" defaultValue={params.status ?? "all"}><option value="all">All statuses</option><option value="lead">Lead</option><option value="subscriber">Subscriber</option><option value="app_user">App user</option><option value="inactive">Inactive</option><option value="archived">Archived</option></select>
          <button className="button button-outline" type="submit">Apply</button>
        </form>

        {people.length ? <div className="people-list studio-list">{people.map((person) => <Link href={`/admin/people/${person.id}`} className="person-row studio-list-row" key={person.id}>
          <div className="person-avatar">{personLabel(person).replace(/^@/, "").slice(0, 1).toUpperCase()}</div>
          <div className="person-main"><strong>{personLabel(person)}</strong><span>{person.email ?? (person.instagram_user_id ? `Instagram ID ${person.instagram_user_id.slice(-8)}` : "No contact identity")}</span></div>
          <div className="person-source"><span>{person.source}</span><small>{person.source_detail ?? "First touch"}</small></div>
          <div className="person-status"><span className={person.status === "subscriber" || person.status === "app_user" ? "status-pill" : "status-pill status-pending"}>{person.status.replace("_", " ")}</span><small>Seen {new Date(person.last_seen_at).toLocaleDateString()}</small></div>
          <ArrowRight size={17}/>
        </Link>)}</div> : <div className="empty-state"><Users size={26}/><strong>No people match this view.</strong><p>New social, email, website, and app activity will populate relationship records here.</p></div>}
      </section>
    </>
  );
}
