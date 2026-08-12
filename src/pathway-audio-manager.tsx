"use client";

import { useMemo, useState } from "react";

type PathwayRow = { slug: string; title: string; estimatedMinutes: number; audioUrl: string | null; generatedAt: string | null; current: boolean };

export function PathwayAudioManager({ pathways }: { pathways: PathwayRow[] }) {
  const [rows, setRows] = useState(pathways);
  const [running, setRunning] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const missing = useMemo(() => rows.filter((row) => !row.audioUrl || !row.current), [rows]);

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
      <div><span className="eyebrow">Publishing</span><h1>Pathway audio</h1><p className="admin-lede">Generate narrated MP3s from the live pathway catalog. Existing audio is reused until the pathway content changes.</p></div>
      <button className="button" type="button" disabled={Boolean(running) || missing.length === 0} onClick={generateMissing}>{running ? `Generating ${running}…` : missing.length ? `Generate ${missing.length} missing / outdated` : "All audio current"}</button>
    </div>
    {message ? <div className="admin-notice">{message}</div> : null}
    <section className="admin-card">
      <table className="admin-table">
        <thead><tr><th>Pathway</th><th>Status</th><th>Generated</th><th>Audio</th><th /></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.slug}>
          <td><strong>{row.title}</strong><br/><small>{row.estimatedMinutes} min reading estimate</small></td>
          <td><strong>{row.audioUrl ? row.current ? "Current" : "Outdated" : "Missing"}</strong></td>
          <td>{row.generatedAt ? new Date(row.generatedAt).toLocaleString() : "—"}</td>
          <td>{row.audioUrl ? <a href={row.audioUrl} target="_blank" rel="noreferrer">Preview</a> : "—"}</td>
          <td><button className="button button-small" type="button" disabled={Boolean(running)} onClick={() => generate(row.slug, Boolean(row.audioUrl))}>{running === row.slug ? "Generating…" : row.audioUrl ? "Regenerate" : "Generate"}</button></td>
        </tr>)}</tbody>
      </table>
    </section>
  </>;
}
