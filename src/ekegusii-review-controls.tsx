"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ClipboardCheck, FilePenLine, Send, XCircle } from "lucide-react";
import type { EkegusiiCorrection } from "@/ekegusii-review-data";

export function EkegusiiReviewControls({ record }: { record: EkegusiiCorrection }) {
  const router = useRouter();
  const [title, setTitle] = useState(record.edited_title ?? record.proposed_title);
  const [explanation, setExplanation] = useState(record.edited_explanation ?? record.proposed_explanation);
  const [hook, setHook] = useState(record.edited_hook ?? record.proposed_hook);
  const [adminNotes, setAdminNotes] = useState(record.admin_notes ?? "");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const disabled = busy || record.status === "published";
  async function update(action: "save" | "approve" | "reject" | "publish") {
    if (action === "publish" && !window.confirm("Publish this approved translation on the public Ekegusii teaching page?")) return;
    setBusy(true); setFeedback("");
    try {
      const response = await fetch("/api/admin/ekegusii-reviews/" + record.id, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, title, explanation, hook, adminNotes }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw Error(data.error || "Unable to save review.");
      setFeedback(action === "publish" ? "Published to the Ekegusii reading edition." : "Review saved: " + data.status.replace("_", " "));
      router.refresh();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Unable to save changes.");
    } finally { setBusy(false); }
  }
  return <section className="admin-card eg-admin-editor">
    <span className="section-kicker">Editor workspace</span><h2>Proposed Ekegusii correction</h2>
    <div className="eg-admin-status-line"><span className={"eg-admin-status " + record.status}>{record.status.replace("_", " ")}</span><span>All edits require approval before publishing.</span></div>
    <label>Ekegusii step title<input value={title} onChange={e=>setTitle(e.target.value)} disabled={disabled} maxLength={400}/></label>
    <label>Ekegusii teaching explanation<textarea value={explanation} onChange={e=>setExplanation(e.target.value)} disabled={disabled} rows={12} maxLength={6000}/></label>
    <label>Ekegusii transition<textarea value={hook} onChange={e=>setHook(e.target.value)} disabled={disabled} rows={4} maxLength={2400}/></label>
    <label>Internal review notes<textarea value={adminNotes} onChange={e=>setAdminNotes(e.target.value)} disabled={disabled} rows={3} maxLength={4000}/></label>
    {record.status === "published" && <p>This published revision is locked. A new submission is required to update it.</p>}
    <div className="eg-admin-actions">
      <button type="button" className="button button-outline" onClick={()=>void update("save")} disabled={disabled}><FilePenLine size={15}/> Save review</button>
      <button type="button" className="button button-outline" onClick={()=>void update("reject")} disabled={disabled}><XCircle size={15}/> Reject</button>
      <button type="button" className="button button-primary" onClick={()=>void update("approve")} disabled={disabled}><ClipboardCheck size={15}/> Approve</button>
      <button type="button" className="button button-primary" onClick={()=>void update("publish")} disabled={disabled || record.status !== "approved"}><Send size={15}/> Publish approved correction</button>
    </div>
    <p role="status" className="eg-admin-feedback">{busy ? "Saving..." : feedback}</p>
    <small><Check size={12}/> Scripture reference is fixed to the original English teaching. Published changes affect the Ekegusii edition only.</small>
  </section>;
}
