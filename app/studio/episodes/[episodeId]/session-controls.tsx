"use client";

import { useState } from "react";
import { Copy, ExternalLink, Play } from "lucide-react";

export function SessionControls({ episodeId, runId }: { episodeId: string; runId: string }) {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [outputUrl, setOutputUrl] = useState("");

  async function startSession() {
    if (starting) return;
    setStarting(true); setError("");
    try {
      const response = await fetch("/api/studio/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ episodeId, runId }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to start session");
      setOutputUrl(`${window.location.origin}/output/${payload.session.id}?token=${encodeURIComponent(payload.outputToken)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to start session");
    } finally { setStarting(false); }
  }

  return <div className="ag-studio-session-controls">
    <button className="ag-studio-primary" onClick={startSession} disabled={starting}><Play size={17}/>{starting ? "Starting…" : "Start session"}</button>
    {outputUrl ? <div className="ag-studio-output-card"><div><span className="ag-studio-eyebrow">OBS Browser Source</span><strong>Program output ready</strong><code>{outputUrl}</code></div><div><button onClick={() => navigator.clipboard.writeText(outputUrl)}><Copy size={16}/> Copy</button><a href={outputUrl} target="_blank" rel="noreferrer"><ExternalLink size={16}/> Open</a></div></div> : null}
    {error ? <div className="ag-studio-error">{error}</div> : null}
  </div>;
}
