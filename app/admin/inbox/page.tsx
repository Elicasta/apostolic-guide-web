import Link from "next/link";
import { redirect } from "next/navigation";
import { Inbox, Instagram, Search } from "lucide-react";
import { getStudioPermission } from "@/auth";
import { listInboxConversations } from "@/inbox";

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const permission = await getStudioPermission("view_inbox");
  if (!permission.allowed && permission.access.state !== "unconfigured") redirect("/admin");
  const params = await searchParams;
  const status = ["open","follow_up","resolved","archived"].includes(params.status ?? "") ? params.status as "open"|"follow_up"|"resolved"|"archived" : "all";
  const conversations = await listInboxConversations(status);
  const q = (params.q ?? "").trim().toLowerCase();
  const filtered = conversations.filter((row) => {
    const person = row.people as unknown as { display_name?: string | null; instagram_username?: string | null; email?: string | null } | null;
    return !q || [person?.display_name, person?.instagram_username, person?.email].some((v) => String(v ?? "").toLowerCase().includes(q));
  });
  const unread = conversations.reduce((sum, row) => sum + Number(row.unread_count ?? 0), 0);
  const followUp = conversations.filter((row) => row.status === "follow_up").length;
  const open = conversations.filter((row) => row.status === "open").length;

  return <>
    <span className="eyebrow">Relationships</span>
    <div className="studio-page-heading">
      <div><h1>Inbox</h1><p className="admin-lede">Instagram conversations, follow-up, and human handoff in one operating view.</p></div>
    </div>

    <div className="studio-kpi-grid studio-kpi-grid-three">
      <div className="studio-kpi"><Inbox size={19}/><span>Unread</span><strong>{unread}</strong><small>Messages waiting for review</small></div>
      <div className="studio-kpi"><Instagram size={19}/><span>Open</span><strong>{open}</strong><small>Active conversations</small></div>
      <div className="studio-kpi"><Instagram size={19}/><span>Follow up</span><strong>{followUp}</strong><small>Conversations marked for follow-up</small></div>
    </div>

    <section className="admin-card inbox-list-card studio-list-card">
      <div className="studio-section-head"><div><span className="section-kicker">Conversations</span><h2>Instagram Inbox</h2></div><span>{filtered.length} shown</span></div>
      <form className="inbox-toolbar studio-filter-bar">
        <label className="people-search studio-search"><Search size={16}/><input name="q" defaultValue={params.q ?? ""} placeholder="Search people" /></label>
        <select name="status" defaultValue={status}><option value="all">All conversations</option><option value="open">Open</option><option value="follow_up">Follow up</option><option value="resolved">Resolved</option><option value="archived">Archived</option></select>
        <button className="button button-outline" type="submit">Apply</button>
      </form>
      {filtered.length ? <div className="inbox-list studio-list">{filtered.map((row) => {
        const person = row.people as unknown as { id?: string; display_name?: string | null; instagram_username?: string | null; email?: string | null; status?: string } | null;
        const label = person?.display_name || (person?.instagram_username ? `@${person.instagram_username}` : person?.email) || "Instagram person";
        return <Link href={`/admin/inbox/${row.id}`} className="inbox-row studio-list-row" key={row.id}>
          <div className="person-avatar">{String(label).replace(/^@/, "").slice(0,1).toUpperCase()}</div>
          <div className="inbox-row-main"><strong>{label}</strong><span><Instagram size={13}/> Instagram · {new Date(row.last_message_at).toLocaleString()}</span></div>
          <span className={`inbox-status inbox-status-${row.status}`}>{String(row.status).replace("_", " ")}</span>
          {Number(row.unread_count) > 0 ? <strong className="inbox-unread">{row.unread_count}</strong> : null}
        </Link>;
      })}</div> : <div className="empty-state"><Inbox size={26}/><strong>No conversations in this view.</strong><p>New Instagram DMs will appear here automatically.</p></div>}
    </section>
  </>;
}
