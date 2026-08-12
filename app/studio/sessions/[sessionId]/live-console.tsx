"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Monitor, PauseCircle, Radio, ShieldAlert, SkipForward, Video } from "lucide-react";
import type { StudioProgramState } from "@/studio/types";

type CueRow = {
  id: string;
  label: string;
  position: number;
  presenter_notes?: string | null;
  enabled: boolean;
  studio_assets?: { snapshot_data?: Record<string, unknown> | null } | null;
};

const scenes = [
  { id: "host-full", label: "Host", icon: Radio },
  { id: "host-scripture", label: "Host + Scripture", icon: Monitor },
  { id: "scripture-full", label: "Scripture", icon: Monitor },
  { id: "question-full", label: "Question", icon: Monitor },
  { id: "pathway-cta", label: "Pathway CTA", icon: Monitor },
  { id: "holding", label: "Technical Hold", icon: PauseCircle },
  { id: "black", label: "Blackout", icon: ShieldAlert }
];

export default function LiveConsole({ initialState, initialCues }: { initialState: StudioProgramState; initialCues: CueRow[] }) {
  const [state, setState] = useState(initialState);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cues = useMemo(() => initialCues.filter((cue) => cue.enabled).sort((a, b) => a.position - b.position), [initialCues]);
  const currentIndex = state.currentCueId ? cues.findIndex((cue) => cue.id === state.currentCueId) : -1;
  const currentCue = currentIndex >= 0 ? cues[currentIndex] : undefined;
  const nextCue = state.nextCueId ? cues.find((cue) => cue.id === state.nextCueId) : cues[currentIndex + 1] ?? cues[0];

  useEffect(() => () => streamRef.current?.getTracks().forEach((track) => track.stop()), []);
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.code !== "Space" || event.repeat || (event.target as HTMLElement | null)?.matches("input,textarea,button,select")) return;
      event.preventDefault();
      if (nextCue && !busy) void takeCue(nextCue.id);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function requestHostCamera() {
    setCameraError("");
    try {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: true });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraReady(true);
    } catch (err) {
      setCameraReady(false);
      setCameraError(err instanceof Error ? err.message : "Camera or microphone unavailable");
    }
  }

  async function takeCue(cueId: string) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/studio/sessions/${state.sessionId}/cues/${cueId}/take`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) {
        if (response.status === 409) window.location.reload();
        throw new Error(payload.error ?? "Unable to take cue");
      }
      if (payload.state) setState(payload.state);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to take cue");
    } finally { setBusy(false); }
  }

  async function runManual(actions: Array<{ id: string; cueId: string; position: number; type: string; payload: Record<string, unknown> }>) {
    if (busy) return;
    setBusy(true); setError("");
    const actionId = crypto.randomUUID();
    try {
      const response = await fetch(`/api/studio/sessions/${state.sessionId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionId, expectedVersion: state.version, actions: actions.map((item, index) => ({ ...item, id: `${actionId}:${index}` })) })
      });
      const payload = await response.json();
      if (!response.ok) {
        if (response.status === 409) window.location.reload();
        throw new Error(payload.error ?? "Unable to update program");
      }
      if (payload.state) setState(payload.state);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update program");
    } finally { setBusy(false); }
  }

  const setScene = (sceneId: string) => runManual([{ id: "manual", cueId: "manual", position: 0, type: "scene.set", payload: { sceneId } }]);
  const clearProgram = () => runManual([{ id: "manual", cueId: "manual", position: 0, type: "program.clear", payload: {} }]);

  return <main className="ag-studio ag-studio-live-console">
    <header className="ag-studio-topbar"><div className="ag-studio-brand"><span className="ag-studio-mark">AG</span><div><strong>Broadcast Studio</strong><span>Live control</span></div></div><span className="ag-studio-status">STATE v{state.version}</span></header>

    <section className="ag-live-workspace">
      <div className="ag-live-program-column">
        <div className="ag-live-preview-card">
          <div className="ag-live-preview-head"><span className="ag-studio-eyebrow">Host source</span><span className={cameraReady ? "ready" : "offline"}>{cameraReady ? "READY" : "NOT CONNECTED"}</span></div>
          <div className="ag-live-camera-frame">{cameraReady ? <video ref={videoRef} autoPlay muted playsInline /> : <div><Camera size={32}/><p>Connect your host camera and microphone before recording.</p><button onClick={requestHostCamera}><Video size={16}/> Enable host media</button></div>}</div>
          {cameraError ? <div className="ag-studio-error">{cameraError}</div> : null}
          <small>Host media preview is local in this pass. Program transport into the OBS renderer is the next media-source bridge.</small>
        </div>

        <div className="ag-live-program-card">
          <div><span className="ag-studio-eyebrow">Program scene</span><h1>{state.currentSceneId}</h1><p>Session {state.sessionId}</p></div>
          <div className="ag-studio-live-indicator"><span/>PROGRAM</div>
        </div>
      </div>

      <aside className="ag-live-cue-stack">
        <div className="ag-live-cue-block current"><span>CURRENT</span><strong>{currentCue?.label ?? "Session ready"}</strong><p>{currentCue?.presenter_notes || "No presenter notes for the current cue."}</p></div>
        <div className="ag-live-cue-block next"><span>NEXT</span><strong>{nextCue?.label ?? "End of run"}</strong><p>{nextCue?.presenter_notes || "Ready when you are."}</p></div>
        <button className="ag-live-take" disabled={!nextCue || busy} onClick={() => nextCue && takeCue(nextCue.id)}><SkipForward size={19}/>{busy ? "TAKING…" : "TAKE NEXT"}<kbd>SPACE</kbd></button>
        <div className="ag-live-run-list">{cues.map((cue, index) => <button key={cue.id} className={cue.id === state.currentCueId ? "active" : ""} disabled={busy} onClick={() => takeCue(cue.id)}><span>{String(index + 1).padStart(2, "0")}</span><strong>{cue.label}</strong></button>)}</div>
      </aside>
    </section>

    {error ? <div className="ag-studio-error ag-live-error">{error}</div> : null}
    <section className="ag-studio-control-grid">{scenes.map(({ id, label, icon: Icon }) => <button key={id} className={state.currentSceneId === id ? "active" : ""} disabled={busy} onClick={() => setScene(id)}><Icon size={18}/><span>{label}</span></button>)}</section>
    <section className="ag-studio-panic-row"><button onClick={() => setScene("host-full")} disabled={busy}>RETURN TO HOST</button><button onClick={clearProgram} disabled={busy}>CLEAR GRAPHICS</button><button onClick={() => setScene("holding")} disabled={busy}>TECHNICAL HOLD</button><button className="danger" onClick={() => setScene("black")} disabled={busy}>BLACKOUT</button></section>
  </main>;
}
