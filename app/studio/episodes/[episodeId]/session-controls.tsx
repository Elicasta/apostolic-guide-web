"use client";

import { useState } from "react";
import { Copy, ExternalLink, Play, SlidersHorizontal, MonitorUp } from "lucide-react";

export function SessionControls({ episodeId, runId }: { episodeId: string; runId: string }) {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [outputUrl, setOutputUrl] = useState("");
  const [consoleUrl, setConsoleUrl] = useState("");
  const [controllerUrl, setControllerUrl] = useState("");
  const [confidenceUrl, setConfidenceUrl] = useState("");

  async function startSession() {
    if (starting) return;
    setStarting(true); setError("");
    try {
      const response = await fetch("/api/studio/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ episodeId, runId }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to start session");
      setOutputUrl(`${window.location.origin}/output/${payload.session.id}?token=${encodeURIComponent(payload.outputToken)}`);
      setConsoleUrl(`/studio/sessions/${payload.session.id}`);
      setControllerUrl(`/studio/controller/${payload.session.id}`);
      setConfidenceUrl(`/studio/confidence/${payload.session.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to start session");
    } finally { setStarting(false); }
  }

  return <div className="ag-studio-session-controls">
    <button className="ag-studio-primary" onClick={startSession} disabled={starting}><Play size={17}/>{starting ? "Starting…" : "Start session"}</button>
    {outputUrl ? <div className="ag-studio-output-card"><div><span className="ag-studio-eyebrow">Session surfaces</span><strong>Broadcast surfaces ready</strong><code>{outputUrl}</code></div><div><button onClick={() => navigator.clipboard.writeText(outputUrl)}><Copy size={16}/> OBS URL</button><a href={outputUrl} target="_blank" rel="noreferrer"><ExternalLink size={16}/> Output</a><a href={consoleUrl}><Play size={16}/> Console</a><a href={controllerUrl} target="_blank" rel="noreferrer"><SlidersHorizontal size={16}/> Controller</a><a href={confidenceUrl} target="_blank" rel="noreferrer"><MonitorUp size={16}/> Confidence</a></div></div> : null}
    {error ? <div className="ag-studio-error">{error}</div> : null}
  </div>;
}
