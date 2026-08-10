"use client";

import { useState } from "react";
import { Plus, Tag, StickyNote } from "lucide-react";
import type { PersonStatus } from "@/people-crm";

export function PersonProfileActions({ personId, status }: { personId: string; status: PersonStatus }) {
  const [tag, setTag] = useState("");
  const [note, setNote] = useState("");
  const [currentStatus, setCurrentStatus] = useState<PersonStatus>(status);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function action(payload: unknown) {
    setBusy(true); setMessage("");
    const response = await fetch(`/api/admin/people/${personId}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const result = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) { setMessage(result.error ?? "Could not save change."); return false; }
    setMessage("Saved.");
    window.setTimeout(() => window.location.reload(), 350);
    return true;
  }

  return <div className="person-action-stack">
    <div className="person-action-block"><label>Status<select value={currentStatus} onChange={async (e) => { const next = e.target.value as PersonStatus; setCurrentStatus(next); await action({ action: "status", status: next }); }} disabled={busy}><option value="lead">Lead</option><option value="subscriber">Subscriber</option><option value="app_user">App user</option><option value="inactive">Inactive</option><option value="archived">Archived</option></select></label></div>
    <div className="person-action-block"><div className="person-action-title"><Tag size={16}/><strong>Add tag</strong></div><div className="person-inline-form"><input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Jesus Is God" /><button type="button" onClick={async () => { if (!tag.trim()) return; if (await action({ action: "add_tag", tag: tag.trim() })) setTag(""); }} disabled={busy || !tag.trim()}><Plus size={16}/></button></div></div>
    <div className="person-action-block"><div className="person-action-title"><StickyNote size={16}/><strong>Add private note</strong></div><textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Follow-up context, questions, or pastoral notes…" /><button className="button button-outline" type="button" onClick={async () => { if (!note.trim()) return; if (await action({ action: "add_note", note: note.trim() })) setNote(""); }} disabled={busy || !note.trim()}>Save note</button></div>
    {message ? <small className="person-action-message">{message}</small> : null}
  </div>;
}
