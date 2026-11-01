"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, GripVertical, Save } from "lucide-react";

type CueRow = { id: string; label: string; position: number; presenter_notes?: string | null };

export function RunEditor({ runId, initialCues }: { runId: string; initialCues: CueRow[] }) {
  const [cues, setCues] = useState([...initialCues].sort((a, b) => a.position - b.position));
  const [savingOrder, setSavingOrder] = useState(false);
  const [noteSaving, setNoteSaving] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= cues.length || savingOrder) return;
    const previous = cues;
    const next = [...cues];
    [next[index], next[target]] = [next[target], next[index]];
    setCues(next);
    setSavingOrder(true); setError("");
    try {
      const response = await fetch(`/api/studio/runs/${runId}/reorder`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cueIds: next.map((cue) => cue.id) }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to reorder run");
      setCues((payload.cues ?? next).map((cue: CueRow, position: number) => ({ ...cue, position })));
    } catch (err) {
      setCues(previous);
      setError(err instanceof Error ? err.message : "Unable to reorder run");
    } finally { setSavingOrder(false); }
  }

  function changeNotes(id: string, value: string) {
    setCues((current) => current.map((cue) => cue.id === id ? { ...cue, presenter_notes: value } : cue));
  }

  async function saveNotes(cue: CueRow) {
    setNoteSaving(cue.id); setError("");
    try {
      const response = await fetch(`/api/studio/cues/${cue.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ presenterNotes: cue.presenter_notes ?? "" }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to save notes");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save notes");
    } finally { setNoteSaving(null); }
  }

  if (!cues.length) return <div className="ag-studio-placeholder">No cues yet. Add pathway Scriptures from the left.</div>;

  return <div className="ag-run-editor">
    {error ? <div className="ag-studio-error">{error}</div> : null}
    {cues.map((cue, index) => <article className="ag-run-cue" key={cue.id}>
      <div className="ag-run-cue-head"><GripVertical size={15}/><span>{String(index + 1).padStart(2, "0")}</span><strong>{cue.label}</strong><div className="ag-run-order"><button aria-label="Move cue up" disabled={index === 0 || savingOrder} onClick={() => move(index, -1)}><ArrowUp size={14}/></button><button aria-label="Move cue down" disabled={index === cues.length - 1 || savingOrder} onClick={() => move(index, 1)}><ArrowDown size={14}/></button></div></div>
      <textarea value={cue.presenter_notes ?? ""} onChange={(event) => changeNotes(cue.id, event.target.value)} placeholder="Presenter notes. These never appear on program output." rows={3}/>
      <button className="ag-run-save" disabled={noteSaving === cue.id} onClick={() => saveNotes(cue)}><Save size={13}/>{noteSaving === cue.id ? "Saving…" : "Save notes"}</button>
    </article>)}
  </div>;
}
