import Link from "next/link";
import { Activity, ArrowRight, BookOpen, Clock3, Inbox, Instagram, ListFilter, Mail, Route, Search, Smartphone, Tag, Users } from "lucide-react";
import { loadSegments, segmentMembers, type SegmentCategory } from "@/segments";
import { personLabel } from "@/people-crm";

const categoryOrder: SegmentCategory[] = ["Lifecycle", "Engagement", "Channels", "Follow-up", "Journeys", "Interests"];

function categoryIcon(category: SegmentCategory) {
  if (category === "Engagement") return <Activity size={18}/>;
  if (category === "Channels") return <Instagram size={18}/>;
  if (category === "Follow-up") return <Inbox size={18}/>;
  if (category === "Journeys") return <Route size={18}/>;
  if (category === "Interests") return <Tag size={18}/>;
  return <Users size={18}/>;
}

function identityIcon(provider: string) {
  if (provider === "instagram") return <Instagram size={13}/>;
  if (provider === "email") return <Mail size={13}/>;
  if (provider === "app") return <Smartphone size={13}/>;
  return <BookOpen size={13}/>;
}

export default async function SegmentsPage({ searchParams }: { searchParams: Promise<{ segment?: string; q?: string }> }) {
  const params = await searchParams;
  const data = await loadSegments();
  const requested = params.segment ?? "all";
  const selected = data.definitions.find((definition) => definition.key === requested) ?? data.definitions.find((definition) => definition.key === "all") ?? null;
  const members = selected ? segmentMembers(data, selected.key) : [];
  const query = (params.q ?? "").trim().toLowerCase();
  const visibleMembers = query ? members.filter((person) => [personLabel(person), person.email, person.instagram_username, ...person.tags].some((value) => String(value ?? "").toLowerCase().includes(query))) : members;

  const allCount = data.definitions.find((item) => item.key === "all")?.count ?? 0;
  const activeCount = data.definitions.find((item) => item.key === "active_7d")?.count ?? 0;
  const followUpCount = new Set([
    ...segmentMembers(data, "unread_inbox").map((person) => person.id),
    ...segmentMembers(data, "follow_up").map((person) => person.id)
  ]).size;
  const interestCount = data.definitions.filter((item) => item.category === "Interests").length;

  return <>
    <span className="eyebrow">Relationships</span>
    <div className="studio-page-heading segments-heading">
      <div><h1>Segments</h1><p className="admin-lede">Live groups built from lifecycle, study behavior, source, journeys, Inbox state, and explicit interests. Membership updates automatically as people interact with Apostolic Guide.</p></div>
    </div>

    <div className="studio-kpi-grid studio-kpi-grid-4">
      <div className="studio-kpi"><Users size={19}/><strong>{allCount}</strong><span>Known people</span></div>
      <div className="studio-kpi"><Activity size={19}/><strong>{activeCount}</strong><span>Active this week</span></div>
      <div className="studio-kpi"><Inbox size={19}/><strong>{followUpCount}</strong><span>Need attention</span></div>
      <div className="studio-kpi"><Tag size={19}/><strong>{interestCount}</strong><span>Interest groups</span></div>
    </div>

    <section className="segments-catalog">
      {categoryOrder.map((category) => {
        const definitions = data.definitions.filter((definition) => definition.category === category);
        if (!definitions.length) return null;
        return <div className="segments-category" key={category}>
          <div className="segments-category-heading"><div>{categoryIcon(category)}<div><span className="section-kicker">{category}</span><h2>{category === "Interests" ? "Interest signals" : `${category} segments`}</h2></div></div><span>{definitions.length}</span></div>
          <div className="segments-grid">{definitions.map((definition) => {
            const active = selected?.key === definition.key;
            return <Link className={`segment-card${active ? " is-active" : ""}`} href={`/admin/segments?segment=${encodeURIComponent(definition.key)}`} key={definition.key}>
              <div className="segment-card-top"><span>{definition.dynamic ? "Live" : "System"}</span><strong>{definition.count}</strong></div>
              <h3>{definition.label}</h3>
              <p>{definition.description}</p>
              <div className="segment-card-action">View people <ArrowRight size={15}/></div>
            </Link>;
          })}</div>
        </div>;
      })}
    </section>

    {selected ? <section className="admin-card segments-members-card">
      <div className="card-heading segments-members-heading"><div><span className="section-kicker">Selected segment</span><h2>{selected.label}</h2><p>{selected.description}</p></div><div className="segments-member-count"><strong>{members.length}</strong><span>people</span></div></div>
      <form className="segments-filter" method="get">
        <input type="hidden" name="segment" value={selected.key}/>
        <label className="people-search"><Search size={16}/><input name="q" defaultValue={params.q ?? ""} placeholder="Search this segment"/></label>
        <button className="button button-outline" type="submit">Search</button>
      </form>
      {visibleMembers.length ? <div className="segment-people-list">{visibleMembers.map((person) => <Link href={`/admin/people/${person.id}`} className="segment-person-row" key={person.id}>
        <div className="person-avatar">{personLabel(person).replace(/^@/, "").slice(0, 1).toUpperCase()}</div>
        <div className="segment-person-main"><strong>{personLabel(person)}</strong><span>{person.email ?? (person.instagram_username ? `@${person.instagram_username}` : person.source_detail ?? person.source)}</span></div>
        <div className="segment-person-identities">{person.identityProviders.slice(0, 3).map((provider) => <span title={provider} key={provider}>{identityIcon(provider)}{provider}</span>)}</div>
        <div className="segment-person-tags">{person.tags.slice(0, 2).map((tag) => <span key={tag}>{tag}</span>)}{person.tags.length > 2 ? <small>+{person.tags.length - 2}</small> : null}</div>
        <div className="segment-person-last"><Clock3 size={13}/><span>{new Date(person.last_seen_at).toLocaleDateString()}</span></div>
        {person.unreadCount > 0 ? <span className="segment-unread">{person.unreadCount}</span> : <ArrowRight size={16}/>} 
      </Link>)}</div> : <div className="empty-state"><ListFilter size={26}/><strong>No people match this view.</strong><p>{query ? "Try a different search inside this segment." : "Membership will update automatically as relationship activity changes."}</p></div>}
    </section> : <section className="admin-card"><div className="empty-state"><ListFilter size={26}/><strong>No segment data yet.</strong><p>Once People data is available, live segments will appear here automatically.</p></div></section>}
  </>;
}
