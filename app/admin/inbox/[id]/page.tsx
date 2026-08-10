import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Instagram, UserRound } from "lucide-react";
import { getStudioPermission } from "@/auth";
import { getInboxConversation, instagramReplyWindowOpen, markConversationRead } from "@/inbox";
import { InboxConversationControls } from "@/inbox-conversation";

export default async function InboxConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const permission = await getStudioPermission("view_inbox");
  if (!permission.allowed && permission.access.state !== "unconfigured") redirect("/admin");
  const { id } = await params;
  const record = await getInboxConversation(id);
  if (!record) notFound();
  await markConversationRead(id);
  const { conversation, messages } = record;
  const person = conversation.people as unknown as { id?: string; display_name?: string | null; instagram_username?: string | null; email?: string | null; status?: string } | null;
  const label = person?.display_name || (person?.instagram_username ? `@${person.instagram_username}` : person?.email) || "Instagram person";
  const canReply = instagramReplyWindowOpen(conversation.last_inbound_at);

  return <>
    <Link className="people-back" href="/admin/inbox"><ArrowLeft size={16}/> Inbox</Link>
    <div className="inbox-thread-heading">
      <div className="person-profile-avatar">{String(label).replace(/^@/, "").slice(0,1).toUpperCase()}</div>
      <div><span className="eyebrow">Instagram conversation</span><h1>{label}</h1><p><Instagram size={14}/> {person?.instagram_username ? `@${person.instagram_username}` : "Instagram"}</p></div>
      {person?.id ? <Link className="button button-outline" href={`/admin/people/${person.id}`}><UserRound size={15}/> View person</Link> : null}
    </div>

    <div className="inbox-thread-grid">
      <section className="admin-card inbox-thread-card">
        <div className="inbox-messages">
          {messages.length ? messages.map((message) => <div key={message.id} className={`inbox-message inbox-message-${message.direction}`}>
            <div><span className="inbox-message-kind">{message.kind === "automation" ? "Automation" : message.direction === "inbound" ? label : "Apostolic Guide"}</span><p>{message.body || "Message"}</p><small>{new Date(message.sent_at).toLocaleString()}</small></div>
          </div>) : <div className="empty-state"><Instagram size={26}/><strong>No stored messages yet.</strong><p>New direct messages will appear here.</p></div>}
        </div>
        <InboxConversationControls conversationId={id} canReply={canReply} status={conversation.status}/>
      </section>

      <aside className="admin-card person-summary-card inbox-context-card">
        <span className="section-kicker">Conversation</span>
        <dl>
          <div><dt>Status</dt><dd>{String(conversation.status).replace("_", " ")}</dd></div>
          <div><dt>Last inbound</dt><dd>{conversation.last_inbound_at ? new Date(conversation.last_inbound_at).toLocaleString() : "None"}</dd></div>
          <div><dt>Last outbound</dt><dd>{conversation.last_outbound_at ? new Date(conversation.last_outbound_at).toLocaleString() : "None"}</dd></div>
          <div><dt>Reply window</dt><dd>{canReply ? "Open" : "Closed"}</dd></div>
          <div><dt>Person status</dt><dd>{person?.status ?? "lead"}</dd></div>
        </dl>
      </aside>
    </div>
  </>;
}
