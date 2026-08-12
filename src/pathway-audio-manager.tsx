"use client";

import { useMemo, useState } from "react";

type PathwayRow = {
  slug: string;
  title: string;
  estimatedMinutes: number;
  audioUrl: string | null;
  generatedAt: string | null;
  current: boolean;
  scriptText: string;
  scriptStatus: "draft" | "approved" | null;
  scriptModel: string | null;
  scriptUpdatedAt: string | null;
  sourceCurrent: boolean;
  starts: number;
  completions: number;
  listenedSeconds: number;
  uniqueListeners: number;
};

function formatListeningTime(seconds: number) {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function completionRate(row: PathwayRow) {
  return row.starts ? `${Math.round((row.completions / row.starts) * 100)}%` : "0%";
}

function scriptLabel(row: PathwayRow) {
  if (!row.scriptText) return "No script";
  if (!row.sourceCurrent) return "Review needed";
  return row.scriptStatus === "approved" ? "Approved" : "Draft";
}

export function PathwayAudioManager({ pathways }: { pathways: PathwayRow[] }) {
  const [rows, setRows] = useState(pathways);
  const [drafts, setDrafts] = useState<Record<string, string>>(() => Object.fromEntries(pathways.map((row) => [row.slug, row.scriptText])));
  const [running, setRunning] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [openSlug, setOpenSlug] = useState<string | null>(null);

  const totalStarts = rows.reduce((sum, row) => sum + row.starts, 0);
  const totalCompletions = rows.reduce((sum, row) => sum + row.completions, 0);
  const totalListeningSeconds = rows.reduce((sum, row) => sum + row.listenedSeconds, 0);
  const approvedCount = rows.filter((row) => row.scriptStatus === "approved" && row.sourceCurrent).length;
  const currentCount = rows.filter((row) => row.current).length;
  const needsReview = useMemo(() => rows.filter((row) => row.scriptText && (!row.sourceCurrent || row.scriptStatus !== "approved")).length, [rows]);

  async function generateScript(slug: string) {
    setRunning(`script:${slug}`);
    setMessage("");
    try {
      const response = await fetch("/api/admin/pathway-audio/script/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Script generation failed.");
      const script = data.script;
      setDrafts((current) => ({ ...current, [slug]: script.script_text }));
      setRows((current) => current.map((row) => row.slug === slug ? { ...row, scriptText: script.script_text, scriptStatus: "draft", scriptModel: script.model, scriptUpdatedAt: script.updated_at, sourceCurrent: true, current: false } : row));
      setOpenSlug(slug);
      setMessage("Draft generated. Review it before approval.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Script generation failed.");
    } finally { setRunning(null); }
  }

  async function saveScript(slug: string, action: "save" | "approve") {
    const scriptText = (drafts[slug] ?? "").trim();
    setRunning(`${action}:${slug}`);
    setMessage("");
    try {
      const response = await fetch("/api/admin/pathway-audio/script", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug, scriptText, action }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Script save failed.");
      const script = data.script;
      setRows((current) => current.map((row) => row.slug === slug ? { ...row, scriptText: script.script_text, scriptStatus: script.status, scriptUpdatedAt: script.updated_at, sourceCurrent: true, current: row.audioUrl ? false : row.current } : row));
      setMessage(action === "approve" ? "Script approved. Audio can now be generated." : "Draft saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Script save failed.");
    } finally { setRunning(null); }
  }

  async function generateAudio(slug: string, force = false) {
    setRunning(`audio:${slug}`);
    setMessage("");
    try {
      const response = await fetch("/api/admin/pathway-audio/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug, force }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Audio generation failed.");
      const asset = data.asset;
      setRows((current) => current.map((row) => row.slug === slug ? { ...row, audioUrl: asset.audio_url, generatedAt: asset.generated_at, current: true } : row));
      setMessage("Audio generated from the approved script.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Audio generation failed.");
    } finally { setRunning(null); }
  }

  return <>
    <div className="studio-page-heading">
      <div><span className="eyebrow">Publishing</span><h1>Pathway audio</h1><p className="admin-lede">Turn each canonical Pathway into a reviewed spoken script, approve the wording, then generate the public audio. Pathway content remains the source of truth.</p></div>
    </div>

    <div className="metric-grid">
      <div className="metric"><strong>{approvedCount}/{rows.length}</strong><span>Scripts approved</span></div>
      <div className="metric"><strong>{needsReview}</strong><span>Need review</span></div>
      <div className="metric"><strong>{currentCount}/{rows.length}</strong><span>Audio current</span></div>
      <div className="metric"><strong>{totalStarts}</strong><span>Audio starts</span></div>
      <div className="metric"><strong>{formatListeningTime(totalListeningSeconds)}</strong><span>Total listening</span></div>
      <div className="metric"><strong>{totalCompletions}</strong><span>Completed listens</span></div>
    </div>

    {message ? <div className="admin-notice">{message}</div> : null}

    <section className="admin-card">
      <table className="admin-table">
        <thead><tr><th>Pathway</th><th>Script</th><th>Audio</th><th>Starts</th><th>Listening</th><th>Completed</th><th /></tr></thead>
        <tbody>{rows.map((row) => {
          const approved = row.scriptStatus === "approved" && row.sourceCurrent;
          return <tr key={row.slug}>
            <td><strong>{row.title}</strong><br/><small>{row.estimatedMinutes} min reading estimate</small></td>
            <td><strong>{scriptLabel(row)}</strong>{row.scriptText ? <><br/><small>{(drafts[row.slug] ?? row.scriptText).length.toLocaleString()} / 4,096 chars</small></> : null}</td>
            <td><strong>{row.audioUrl ? row.current ? "Current" : "Outdated" : "Missing"}</strong></td>
            <td>{row.starts}</td><td>{formatListeningTime(row.listenedSeconds)}</td><td>{row.completions}<br/><small>{completionRate(row)}</small></td>
            <td><button className="button button-small" type="button" onClick={() => setOpenSlug(openSlug === row.slug ? null : row.slug)}>{openSlug === row.slug ? "Close" : "Open"}</button></td>
          </tr>;
        })}</tbody>
      </table>
    </section>

    {openSlug ? (() => {
      const row = rows.find((item) => item.slug === openSlug);
      if (!row) return null;
      const text = drafts[row.slug] ?? "";
      const approved = row.scriptStatus === "approved" && row.sourceCurrent;
      const busy = Boolean(running);
      return <section className="admin-card" style={{ marginTop: 18 }}>
        <div className="studio-page-heading">
          <div><span className="eyebrow">Script → Review → Audio</span><h2>{row.title}</h2><p className="admin-lede">{!row.sourceCurrent && row.scriptText ? "The canonical Pathway changed. Review or regenerate this script before approval." : "Edit the narration exactly as you want it spoken. Approval locks this version for audio generation."}</p></div>
          <button className="button" type="button" disabled={busy} onClick={() => generateScript(row.slug)}>{running === `script:${row.slug}` ? "Generating…" : row.scriptText ? "Regenerate draft" : "Generate draft"}</button>
        </div>
        <textarea value={text} onChange={(event) => {
          const value = event.target.value.slice(0, 4096);
          setDrafts((current) => ({ ...current, [row.slug]: value }));
          setRows((current) => current.map((item) => item.slug === row.slug ? { ...item, scriptStatus: item.scriptStatus === "approved" && value === item.scriptText ? "approved" : "draft", current: value === item.scriptText ? item.current : false } : item));
        }} placeholder="Generate a draft or write the narration here…" style={{ width: "100%", minHeight: 360, resize: "vertical", padding: 18, borderRadius: 12, font: "inherit", lineHeight: 1.65 }} />
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
          <small>{text.length.toLocaleString()} / 4,096 characters{row.scriptModel ? ` · Draft model: ${row.scriptModel}` : ""}</small>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="button button-small" type="button" disabled={busy || text.trim().length < 100} onClick={() => saveScript(row.slug, "save")}>Save draft</button>
            <button className="button button-small" type="button" disabled={busy || text.trim().length < 100} onClick={() => saveScript(row.slug, "approve")}>{running === `approve:${row.slug}` ? "Approving…" : approved ? "Re-approve script" : "Approve script"}</button>
            <button className="button button-small" type="button" disabled={busy || !approved} onClick={() => generateAudio(row.slug, Boolean(row.audioUrl))}>{running === `audio:${row.slug}` ? "Generating audio…" : row.audioUrl ? "Regenerate audio" : "Generate audio"}</button>
            {row.audioUrl ? <a className="button button-small" href={row.audioUrl} target="_blank" rel="noreferrer">Preview audio</a> : null}
          </div>
        </div>
      </section>;
    })() : null}
  </>;
}
