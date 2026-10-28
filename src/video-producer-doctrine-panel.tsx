"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, ShieldCheck, TriangleAlert } from "lucide-react";
import styles from "./video-producer-doctrine-panel.module.css";

type Status = "not_checked" | "pass" | "flag" | "flagged_approved" | "fail";
type Issue = { severity: "flag" | "fail"; location: string; line: string; reason: string; reference: string };
type ResponseData = {
  state?: Status;
  canOverride?: boolean;
  verdict?: { summary?: string; model?: string; issues?: Issue[] } | null;
  review?: { summary?: string; issues?: Issue[] };
  model?: string;
  error?: string;
};

const labels: Record<Status, string> = {
  not_checked: "Not checked", pass: "Passed", flag: "Needs owner review",
  flagged_approved: "Owner-approved flag", fail: "Failed"
};
const isApproved = (status: Status) => status === "pass" || status === "flagged_approved";

export function VideoProducerDoctrinePanel({ projectId, onChange }: {
  projectId: string;
  onChange?: (ready: boolean) => void;
}) {
  const [status, setStatus] = useState<Status>("not_checked");
  const [issues, setIssues] = useState<Issue[]>([]);
  const [summary, setSummary] = useState("");
  const [model, setModel] = useState("");
  const [canOverride, setCanOverride] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) { setStatus("not_checked"); setSummary(""); setIssues([]); setError(""); setNote(""); onChange?.(false); }
    });
    fetch("/api/admin/video-producer/doctrine-check?projectId=" + encodeURIComponent(projectId), { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json() as ResponseData;
        if (!response.ok) throw new Error(data.error || "Could not load doctrine status.");
        if (!active) return;
        const next = data.state || "not_checked";
        setStatus(next);
        setSummary(data.verdict?.summary || "");
        setIssues(data.verdict?.issues || []);
        setModel(data.verdict?.model || "");
        setCanOverride(Boolean(data.canOverride));
        onChange?.(isApproved(next));
      })
      .catch((cause) => { if (active) { setError(cause instanceof Error ? cause.message : "Status unavailable."); onChange?.(false); } });
    return () => { active = false; };
  }, [projectId, onChange]);

  async function submit(method: "POST" | "PATCH") {
    setBusy(true);
    setError("");
    onChange?.(false);
    try {
      const response = await fetch("/api/admin/video-producer/doctrine-check", {
        method, headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId, ...(method === "PATCH" ? { note: note.trim() } : {}) })
      });
      const data = await response.json() as ResponseData;
      if (!response.ok) throw new Error(data.error || "Doctrine check failed.");
      const next = data.state || "not_checked";
      setStatus(next);
      setSummary(data.review?.summary || data.verdict?.summary || summary);
      setIssues(data.review?.issues || data.verdict?.issues || issues);
      setModel(data.model || data.verdict?.model || model);
      if (method === "POST") setNote("");
      onChange?.(isApproved(next));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Doctrine service unavailable.");
      onChange?.(false);
    } finally { setBusy(false); }
  }

  return <section className={styles.panel} aria-label="Video doctrine review">
    <div className={styles.header}>
      <div className={styles.title}><ShieldCheck size={19}/><div><strong>Doctrine check</strong><small>Required before final video approval</small></div></div>
      <span className={styles.status} data-status={status}>{labels[status]}</span>
    </div>
    <p className={styles.copy}>{summary || "Check spoken words, saved overlays, and visible kinetic scene text before approving the exact edit."}</p>
    {model ? <p className={styles.meta}>AI review: {model}. Editing the saved content invalidates this verdict.</p> : null}
    {issues.length > 0 ? <div className={styles.issues}>{issues.map((issue, index) =>
      <div className={styles.issue} key={index}>
        <strong>{issue.severity.toUpperCase()} · {issue.location}</strong>
        <p>{issue.reason}</p>
        {issue.line ? <blockquote>{issue.line}</blockquote> : null}
        {issue.reference ? <small>{issue.reference}</small> : null}
      </div>
    )}</div> : null}
    {status === "flag" && canOverride ? <div className={styles.override}>
      <label htmlFor="video-doctrine-owner-note">Owner override reason</label>
      <textarea id="video-doctrine-owner-note" rows={3} maxLength={2000} minLength={12}
        value={note} onChange={(event) => setNote(event.target.value)}
        placeholder="Explain why the flagged wording is doctrinally acceptable."/>
      <button type="button" className={styles.overrideButton} disabled={busy || note.trim().length < 12}
        onClick={() => void submit("PATCH")}>Approve flagged result as owner</button>
    </div> : null}
    {status === "flag" && !canOverride ? <p className={styles.meta}>Only the account owner can override a flagged review.</p> : null}
    {status === "fail" ? <p className={styles.blocked}>A failed doctrine check cannot be overridden. Correct the content and run the check again.</p> : null}
    {error ? <p role="alert" className={styles.error}><TriangleAlert size={15}/>{error}</p> : null}
    <div className={styles.actions}>
      <button type="button" disabled={busy} className={styles.checkButton} onClick={() => void submit("POST")}>
        {busy ? <Loader2 size={15} className={styles.spin}/> : <ShieldCheck size={15}/>}
        {busy ? "Checking..." : "Run doctrine check"}
      </button>
      {isApproved(status) && !error ? <span className={styles.ready}><CheckCircle2 size={15}/> Final approval unlocked for this saved content</span> : null}
    </div>
  </section>;
}
