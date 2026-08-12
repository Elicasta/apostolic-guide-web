"use client";

import { useMemo, useState } from "react";

type PathwayRow = {
  slug: string;
  title: string;
  estimatedMinutes: number;
  audioUrl: string | null;
  generatedAt: string | null;
  current: boolean;
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

export function PathwayAudioManager({ pathways }: { pathways: PathwayRow[] }) {
  const [rows, setRows] = useState(pathways);
  const [running, setRunning] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const missing = useMemo(() => rows.filter((row) => !row.audioUrl || !row.current), [rows]);
  const totalStarts = rows.reduce((sum, row) => sum + row.starts, 0);
  const totalCompletions = rows.reduce((sum, row) => sum + row.completions, 0);
  const totalListeningSeconds = rows.reduce((sum, row) => sum + row.listenedSeconds, 0);
  const currentCount = rows.length - missing.length;

  async function generate(slug: string, force = false) {
    setRunning(slug);
    setMessage("");
    try {
      const response = await fetch("/api/admin/pathway-audio/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, force })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Audio generation failed.");
      const asset = data.asset;
      setRows((current) => current.map((row) => row.slug === slug ? { ...row, audioUrl: asset.audio_url, generatedAt: asset.generated_at, current: true } : row));
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Audio generation failed.");
      return false;
    } finally {
      setRunning(null);
    }
  }

  async function generateMissing() {
    setMessage("");
    for (const row of missing) {
      const ok = await generate(row.slug, Boolean(row.audioUrl));
      if (!ok) return;
    }
    setMessage("All pathway audio is current.");
  }

  return <>
    <div className="studio-page-heading">
      <div><span className="eyebrow">Publishing</span><h1>Pathway audio</h1><p className="admin-lede">Generate AI narration from the live pathway catalog and see what people actually listen to. Existing audio stays in place until pathway content changes.</p></div>
      <button className="button" type="button" disabled={Boolean(running) || missing.length === 0} onClick={generateMissing}>{running ? `Generating ${running}…` : missing.length ? `Generate ${missing.length} missing / outdated` : "All audio current"}</button>
    </div>

    <div className="metric-grid">
      <div className="metric"><strong>{currentCount}/{rows.length}</strong><span>Audio current</span></div>
      <div className="metric"><strong>{totalStarts}</strong><span>Audio starts</span></div>
      <div className="metric"><strong>{formatListeningTime(totalListeningSeconds)}</strong><span>Total listening</span></div>
      <div className="metric"><strong>{totalCompletions}</strong><span>Completed listens</span></div>
      <div className="metric"><strong>{totalStarts ? Math.round((totalCompletions / totalStarts) * 100) : 0}%</strong><span>Completion rate</span></div>
    </div>

    {message ? <div className="admin-notice">{message}</div> : null}
    <section className="admin-card">
      <table className="admin-table">
        <thead><tr><th>Pathway</th><th>Status</th><th>Starts</th><th>Listeners</th><th>Listening</th><th>Completed</th><th>Generated</th><th>Audio</th><th /></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.slug}>
          <td><strong>{row.title}</strong><br/><small>{row.estimatedMinutes} min reading estimate</small></td>
          <td><strong>{row.audioUrl ? row.current ? "Current" : "Outdated" : "Missing"}</strong></td>
          <td><strong>{row.starts}</strong></td>
          <td><strong>{row.uniqueListeners}</strong></td>
          <td><strong>{formatListeningTime(row.listenedSeconds)}</strong></td>
          <td><strong>{row.completions}</strong><br/><small>{completionRate(row)} of starts</small></td>
          <td>{row.generatedAt ? new Date(row.generatedAt).toLocaleString() : "—"}</td>
          <td>{row.audioUrl ? <a href={row.audioUrl} target="_blank" rel="noreferrer">Preview</a> : "—"}</td>
          <td><button className="button button-small" type="button" disabled={Boolean(running)} onClick={() => generate(row.slug, Boolean(row.audioUrl))}>{running === row.slug ? "Generating…" : row.audioUrl ? "Regenerate" : "Generate"}</button></td>
        </tr>)}</tbody>
      </table>
    </section>
  </>;
}
