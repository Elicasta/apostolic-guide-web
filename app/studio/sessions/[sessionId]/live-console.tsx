"use client";

import { useState } from "react";
import { Monitor, PauseCircle, Radio, ShieldAlert } from "lucide-react";
import type { StudioProgramState } from "@/studio/types";

const scenes = [
  { id: "host-full", label: "Host", icon: Radio },
  { id: "host-scripture", label: "Host + Scripture", icon: Monitor },
  { id: "scripture-full", label: "Scripture", icon: Monitor },
  { id: "question-full", label: "Question", icon: Monitor },
  { id: "pathway-cta", label: "Pathway CTA", icon: Monitor },
  { id: "holding", label: "Technical Hold", icon: PauseCircle },
  { id: "black", label: "Blackout", icon: ShieldAlert }
];

export default function LiveConsole({ initialState }: { initialState: StudioProgramState }) {
  const [state, setState] = useState(initialState);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function setScene(sceneId: string) {
    if (busy) return;
    setBusy(true); setError("");
    const actionId = crypto.randomUUID();
    try {
      const response = await fetch(`/api/studio/sessions/${state.sessionId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionId, expectedVersion: state.version, actions: [{ id: `${actionId}:scene`, cueId: "manual", position: 0, type: "scene.set", payload: { sceneId } }] })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to change scene");
      if (payload.state) setState(payload.state);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to change scene");
    } finally { setBusy(false); }
  }

  async function clearProgram() {
    if (busy) return;
    setBusy(true); setError("");
    const actionId = crypto.randomUUID();
    try {
      const response = await fetch(`/api/studio/sessions/${state.sessionId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionId, expectedVersion: state.version, actions: [{ id: `${actionId}:clear`, cueId: "manual", position: 0, type: "program.clear", payload: {} }] })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to clear program");
      if (payload.state) setState(payload.state);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to clear program");
    } finally { setBusy(false); }
  }

  return <main className="ag-studio ag-studio-live-console">
    <header className="ag-studio-topbar"><div className="ag-studio-brand"><span className="ag-studio-mark">AG</span><div><strong>Broadcast Studio</strong><span>Live control</span></div></div><span className="ag-studio-status">STATE v{state.version}</span></header>
    <section className="ag-studio-live-stage"><div><span className="ag-studio-eyebrow">Program</span><h1>{state.currentSceneId}</h1><p>Session {state.sessionId}</p></div><div className="ag-studio-live-indicator"><span/>PROGRAM</div></section>
    {error ? <div className="ag-studio-error">{error}</div> : null}
    <section className="ag-studio-control-grid">{scenes.map(({ id, label, icon: Icon }) => <button key={id} className={state.currentSceneId === id ? "active" : ""} disabled={busy} onClick={() => setScene(id)}><Icon size={18}/><span>{label}</span></button>)}</section>
    <section className="ag-studio-panic-row"><button onClick={() => setScene("host-full")} disabled={busy}>RETURN TO HOST</button><button onClick={clearProgram} disabled={busy}>CLEAR GRAPHICS</button><button onClick={() => setScene("holding")} disabled={busy}>TECHNICAL HOLD</button><button className="danger" onClick={() => setScene("black")} disabled={busy}>BLACKOUT</button></section>
  </main>;
}
