import Link from "next/link";
import { Inbox, Instagram, Search } from "lucide-react";
import { listInboxConversations } from "@/inbox";

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const params = await searchParams;
  const status = ["open","follow_up","resolved","archived"].includes(params.status ?? "") ? params.status as "open"|"follow_up"|"resolved"|"archived" : "all";
  const conversations = await listInboxConversations(status);
  const q = (params.q ?? "").trim().toLowerCase();
  const filtered = conversations.filter((row) => {
    const person = row.people as unknown as { display_name?: string | null; instagram_username?: string | null; email?: string | null } | null;
    return !q || [person?.display_name, person?.instagram_username, person?.email].some((v) => String(v ?? "").toLowerCase().includes(q));
  });
  const unread = conversations.reduce((sum, row) => sum + Number(row.unread_count ?? 0), 0);

  return <>
    <div className="people-heading"><div><span className="eyebrow">Growth</span><h1>Inbox</h1><p>Instagram conversations, follow-ups, and human handoff in one place.</p></div><div className="inbox-count"><Inbox size={18}/><strong>{unread}</strong><span>Unread</span></div></div>
    <form className="inbox-toolbar">
      <label className="people-search"><Search size={16}/><input name="q" defaultValue={params.q ?? ""} placeholder="Search people" /></label>
      <select name="status" defaultValue={status}><option value="all">All conversations</option><option value="open">Open</option><option value="follow_up">Follow up</option><option value="resolved">Resolved</option><option value="archived">Archived</option></select>
      <button className="button button-outline" type="submit">Filter</button>
    </form>
    <section className="admin-card inbox-list-card">
      {filtered.length ? <div className="inbox-list">{filtered.map((row) => {
        const person = row.people as unknown as { id?: string; display_name?: string | null; instagram_username?: string | null; email?: string | null; status?: string } | null;
        const label = person?.display_name || (person?.instagram_username ? `@${person.instagram_username}` : person?.email) || "Instagram person";
        return <Link href={`/admin/inbox/${row.id}`} className="inbox-row" key={row.id}>
          <div className="person-avatar">{String(label).replace(/^@/, "").slice(0,1).toUpperCase()}</div>
          <div className="inbox-row-main"><strong>{label}</strong><span><Instagram size={13}/> Instagram · {new Date(row.last_message_at).toLocaleString()}</span></div>
          <span className={`inbox-status inbox-status-${row.status}`}>{String(row.status).replace("_", " ")}</span>
          {Number(row.unread_count) > 0 ? <strong className="inbox-unread">{row.unread_count}</strong> : null}
        </Link>;
      })}</div> : <div className="empty-state"><Inbox size={26}/><strong>No conversations yet.</strong><p>New Instagram DMs will appear here automatically.</p></div>}
    </section>
  </>;
}
