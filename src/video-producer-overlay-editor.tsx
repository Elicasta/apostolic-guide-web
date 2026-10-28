"use client";

import { useState } from "react";
import type { VideoProducerEditPlan } from "./video-producer";
import { formatProducerTime } from "./video-producer";
import styles from "./video-producer-sequential.module.css";

export function VideoProducerOverlayEditor({
  projectId, plan, updatedAt, canEdit, onSaved
}: {
  projectId: string;
  plan: VideoProducerEditPlan;
  updatedAt: string;
  canEdit: boolean;
  onSaved: () => Promise<void>;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function save(action: "edit-overlay" | "correct-scripture", overlayId?: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/video-producer/overlays", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId, expectedUpdatedAt: updatedAt, action,
          ...(action === "edit-overlay" ? { overlayId, title: title.trim(), body: body.trim() } : {})
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save overlay changes.");
      setNotice(action === "correct-scripture" ? "Scripture graphics corrected from KJV. Doctrine review refreshed." : "Overlay saved. Doctrine review refreshed.");
      setEditingId(null);
      await onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Overlay update failed.");
    } finally {
      setBusy(false);
    }
  }

  return <section aria-label="Video overlay decisions">
    <div className={styles.decisionList}>
      {plan.overlays.map((overlay, index) => <div className={styles.decision} key={overlay.id}>
        <small>Overlay {index + 1} · {overlay.kind} · {formatProducerTime(overlay.start)}{overlay.reference ? " · " + overlay.reference : ""}</small>
        {editingId === overlay.id && canEdit ? <div className={styles.fields}>
          <div className={styles.field}>
            <label htmlFor={"overlay-title-" + overlay.id}>Overlay text</label>
            <textarea id={"overlay-title-" + overlay.id} className={styles.input} style={{ minHeight: 82, padding: 12 }}
              maxLength={1500} value={title} onChange={(event) => setTitle(event.target.value)} />
          </div>
          <div className={styles.field}>
            <label htmlFor={"overlay-body-" + overlay.id}>Additional line (optional)</label>
            <textarea id={"overlay-body-" + overlay.id} className={styles.input} style={{ minHeight: 82, padding: 12 }}
              maxLength={1000} value={body} onChange={(event) => setBody(event.target.value)} />
          </div>
          <div className={styles.actions}>
            <button type="button" className={styles.buttonSecondary} disabled={busy} onClick={() => setEditingId(null)}>Cancel</button>
            <button type="button" className={styles.button} disabled={busy || !title.trim()} onClick={() => void save("edit-overlay", overlay.id)}>Save text</button>
          </div>
        </div> : <>
          <strong>{overlay.title}</strong>
          {overlay.body ? <p className={styles.panelText}>{overlay.body}</p> : null}
          {canEdit ? <button type="button" className={styles.buttonSecondary} style={{ minHeight: 32, marginTop: 8 }}
            disabled={busy} onClick={() => { setEditingId(overlay.id); setTitle(overlay.title); setBody(overlay.body || ""); setError(""); }}>Edit text</button> : null}
        </>}
      </div>)}
    </div>
    {canEdit && plan.overlays.some((overlay) => overlay.kind === "scripture") ?
      <button type="button" className={styles.buttonSecondary} style={{ marginTop: 12 }} disabled={busy}
        onClick={() => void save("correct-scripture")}>Correct all Scripture overlays from KJV</button> : null}
    {!canEdit ? <p className={styles.panelText}>Overlay text can be changed by the owner while the edit plan is still a draft.</p> : null}
    {notice ? <p role="status" className={styles.notice} style={{ marginTop: 12 }}>{notice}</p> : null}
    {error ? <p role="alert" className={styles.error} style={{ marginTop: 12 }}>{error}</p> : null}
  </section>;
}
