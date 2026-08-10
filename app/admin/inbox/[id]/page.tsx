import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Instagram, Mail, UserRound } from "lucide-react";
import { getStudioPermission } from "@/auth";
import { getInboxConversation, instagramReplyWindowOpen, markConversationRead } from "@/inbox";
import { InboxConversationControls } from "@/inbox-conversation";

function metadataText(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== "object") return null;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value : null;
}

export default async function InboxConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const permission = await getStudioPermission("view_inbox");
  if (!permission.allowed && permission.access.state !== "unconfigured") redirect("/admin");
  const { id } = await params;
  const record = await getInboxConversation(id);
  if (!record) notFound();
  await markConversationRead(id);
  const { conversation, messages } = record;
  const website = conversation.platform === "website";
  const person = conversation.people as unknown as { id?: string; display_name?: string | null; instagram_username?: string | null; email?: string | null; status?: string } | null;
  const label = person?.display_name || (person?.instagram_username ? `@${person.instagram_username}` : person?.email) || (website ? "Website contact" : "Instagram person");
  const canReply = website ? Boolean(person?.email) : instagramReplyWindowOpen(conversation.last_inbound_at);
  const latestInbound = [...messages].reverse().find((message) => message.direction === "inbound");
  const reference = metadataText(latestInbound?.metadata, "reference_id");
  const category = metadataText(latestInbound?.metadata, "category");
  const context = metadataText(latestInbound?.metadata, "context");
  const location = metadataText(latestInbound?.metadata, "location");

  return <>
    <Link className="people-back" href="/admin/inbox"><ArrowLeft size={16}/> Inbox</Link>
    <div className="inbox-thread-heading">
      <div className={`person-profile-avatar inbox-thread-channel ${website ? "website" : "instagram"}`}>{website ? <Mail size={20}/> : <Instagram size={20}/>}</div>
      <div><span className="eyebrow">{website ? "Website form" : "Instagram conversation"}</span><h1>{label}</h1><p>{website ? <Mail size={14}/> : <Instagram size={14}/>} {website ? person?.email ?? "Email unavailable" : person?.instagram_username ? `@${person.instagram_username}` : "Instagram"}</p></div>
      {person?.id ? <Link className="button button-outline" href={`/admin/people/${person.id}`}><UserRound size={15}/> View person</Link> : null}
    </div>

    <div className="inbox-thread-grid">
      <section className="admin-card inbox-thread-card">
        {website && (category || reference || context || location) ? <div className="inbox-form-summary">
          <span className="section-kicker">Latest submission</span>
          <div>{category ? <span><small>Category</small><strong>{category}</strong></span> : null}{reference ? <span><small>Reference</small><strong>{reference}</strong></span> : null}{location ? <span><small>Location</small><strong>{location}</strong></span> : null}{context ? <span><small>Context</small><strong>{context}</strong></span> : null}</div>
        </div> : null}
        <div className="inbox-messages">
          {messages.length ? messages.map((message) => {
            const messageReference = metadataText(message.metadata, "reference_id");
            const messageCategory = metadataText(message.metadata, "category");
            return <div key={message.id} className={`inbox-message inbox-message-${message.direction}`}>
              <div><span className="inbox-message-kind">{message.kind === "automation" ? "Automation" : message.direction === "inbound" ? (website ? "Website form" : label) : "Apostolic Guide"}</span>{website && message.direction === "inbound" && (messageCategory || messageReference) ? <small className="inbox-message-meta">{[messageCategory, messageReference].filter(Boolean).join(" · ")}</small> : null}<p>{message.body || "Message"}</p><small>{new Date(message.sent_at).toLocaleString()}</small></div>
            </div>;
          }) : <div className="empty-state">{website ? <Mail size={26}/> : <Instagram size={26}/>}<strong>No stored messages yet.</strong><p>New messages will appear here.</p></div>}
        </div>
        <InboxConversationControls conversationId={id} canReply={canReply} status={conversation.status} channel={website ? "website" : "instagram"}/>
      </section>

      <aside className="admin-card person-summary-card inbox-context-card">
        <span className="section-kicker">Conversation</span>
        <dl>
          <div><dt>Channel</dt><dd>{website ? "Website / email" : "Instagram"}</dd></div>
          <div><dt>Status</dt><dd>{String(conversation.status).replace("_", " ")}</dd></div>
          <div><dt>Last inbound</dt><dd>{conversation.last_inbound_at ? new Date(conversation.last_inbound_at).toLocaleString() : "None"}</dd></div>
          <div><dt>Last outbound</dt><dd>{conversation.last_outbound_at ? new Date(conversation.last_outbound_at).toLocaleString() : "None"}</dd></div>
          <div><dt>{website ? "Reply by" : "Reply window"}</dt><dd>{website ? (person?.email ?? "Email unavailable") : canReply ? "Open" : "Closed"}</dd></div>
          <div><dt>Person status</dt><dd>{person?.status ?? "lead"}</dd></div>
        </dl>
      </aside>
    </div>
  </>;
}
