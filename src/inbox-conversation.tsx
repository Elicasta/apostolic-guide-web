"use client";

import { useState } from "react";
import { Clock3, Mail, Send } from "lucide-react";

export function InboxConversationControls({ conversationId, canReply, status, channel }: { conversationId: string; canReply: boolean; status: string; channel: "instagram" | "website" }) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [currentStatus, setCurrentStatus] = useState(status);

  async function post(payload: unknown) {
    setBusy(true); setMessage("");
    const response = await fetch(`/api/admin/inbox/${conversationId}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const result = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) { setMessage(result.error ?? "Could not complete action."); return false; }
    return true;
  }

  async function send() {
    if (!body.trim()) return;
    if (await post({ action: "reply", body: body.trim() })) { setBody(""); setMessage(channel === "website" ? "Email sent." : "Sent."); window.setTimeout(() => window.location.reload(), 300); }
  }

  return <div className="inbox-controls">
    <div className="inbox-status-control"><label>Conversation status<select value={currentStatus} disabled={busy} onChange={async (event) => { const next = event.target.value; setCurrentStatus(next); if (await post({ action: "status", status: next })) window.location.reload(); }}><option value="open">Open</option><option value="follow_up">Follow up</option><option value="resolved">Resolved</option><option value="archived">Archived</option></select></label></div>
    <div className="inbox-reply-box">
      {channel === "instagram" && !canReply ? <div className="inbox-window-warning"><Clock3 size={15}/><span>Instagram's reply window is closed. This person needs to message again before a manual reply can be sent.</span></div> : null}
      {channel === "website" ? <div className="inbox-email-reply-note"><Mail size={15}/><span>Your reply will be sent by email and stored in this thread.</span></div> : null}
      <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={10000} placeholder={channel === "website" ? "Write an email reply…" : "Write a reply…"} disabled={!canReply || busy}/>
      <div><small>{body.length}/10000</small><button type="button" className="button button-crimson" onClick={send} disabled={!canReply || busy || !body.trim()}>{busy ? "Sending…" : <>{channel === "website" ? "Send email" : "Send reply"} <Send size={15}/></>}</button></div>
      {message ? <small className="person-action-message">{message}</small> : null}
    </div>
  </div>;
}
