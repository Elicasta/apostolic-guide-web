"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Clock3, Loader2, Sparkles } from "lucide-react";
import { formatProducerTime, type VideoProducerKineticTreatment } from "@/video-producer";
import styles from "./video-producer-kinetic-review.module.css";

type KineticCue = {
  id: string;
  start: number;
  duration: number;
  title: string;
  body?: string | null;
  treatment: VideoProducerKineticTreatment;
  animation: string;
  placement: string;
};

type State = {
  project: { id: string; title: string; status: string; approved: boolean };
  kinetics: KineticCue[];
};

const TREATMENTS: Array<{ id: Exclude<VideoProducerKineticTreatment, "strike">; label: string; note: string }> = [
  { id: "impact", label: "Impact", note: "Huge phrase over A-roll → crimson field wipe → editorial lockup" },
  { id: "split", label: "Split", note: "Paper claim + crimson response in a divided frame" },
  { id: "band", label: "Band", note: "Moving paper field carries one short phrase" },
  { id: "stack", label: "Stack", note: "Crimson headline + staggered paper support" },
  { id: "question-stack", label: "Question stack", note: "Stacked prompts + oversized question field" }
];

function normalizeReviewCue(cue: KineticCue): KineticCue {
  return cue.treatment === "strike" ? { ...cue, treatment: "impact" } : cue;
}

function supportLines(value?: string | null) {
  return (value ?? "").split("|").map((line) => line.trim()).filter(Boolean).slice(0, 4);
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status}).`);
  return body as T;
}

export function VideoProducerKineticReview({ projectId }: { projectId: string }) {
  const [state, setState] = useState<State | null>(null);
  const [drafts, setDrafts] = useState<Record<string, KineticCue>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const next = await api<State>(`/api/admin/video-producer/kinetic?projectId=${encodeURIComponent(projectId)}`);
      const normalized: State = { ...next, kinetics: next.kinetics.map(normalizeReviewCue) };
      setState(normalized);
      setDrafts(Object.fromEntries(normalized.kinetics.map((cue) => [cue.id, cue])));
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Kinetic graphics could not be loaded.");
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  async function save(id: string) {
    const cue = drafts[id];
    if (!cue) return;
    setBusy(id); setError(""); setMessage("");
    try {
      const next = await api<State>("/api/admin/video-producer/kinetic", {
        method: "PATCH",
        body: JSON.stringify({
          projectId,
          overlayId: cue.id,
          title: cue.title,
          body: cue.body || null,
          treatment: cue.treatment === "strike" ? "impact" : cue.treatment,
          start: Number(cue.start),
          duration: Number(cue.duration)
        })
      });
      const normalized: State = { ...next, kinetics: next.kinetics.map(normalizeReviewCue) };
      setState(normalized);
      setDrafts(Object.fromEntries(normalized.kinetics.map((item) => [item.id, item])));
      setMessage("Kinetic graphic saved. Any previous production approval was cleared for re-review.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Kinetic graphic could not be saved.");
    } finally { setBusy(null); }
  }

  if (!state) {
    return <section className={styles.shell}><div className={styles.loading}><Loader2 size={16}/> Loading kinetic graphics…</div></section>;
  }
  if (!state.kinetics.length) return null;

  return (
    <section className={styles.shell}>
      <header className={styles.header}>
        <div>
          <div className={styles.eyebrow}>KINETIC GRAPHICS / 02</div>
          <h2>Text hits that transform the frame</h2>
          <p>Sol chooses faithful spoken copy. The renderer moves from A-roll into field wipes, split frames, oversized type and staggered support without scribbles or crossed-out text.</p>
        </div>
        <span className={styles.count}>{state.kinetics.length} cue{state.kinetics.length === 1 ? "" : "s"}</span>
      </header>

      {error ? <div className={styles.error}>{error}</div> : null}
      {message ? <div className={styles.message}><Check size={14}/>{message}</div> : null}

      <div className={styles.grid}>
        {state.kinetics.map((sourceCue, index) => {
          const cue = drafts[sourceCue.id] ?? sourceCue;
          const safeTreatment = cue.treatment === "strike" ? "impact" : cue.treatment;
          const treatment = TREATMENTS.find((item) => item.id === safeTreatment) ?? TREATMENTS[0];
          const secondaryLines = supportLines(cue.body);
          return (
            <article className={styles.card} key={sourceCue.id}>
              <div className={styles.cardTop}>
                <div className={styles.number}>{String(index + 1).padStart(2, "0")}</div>
                <div className={styles.time}><Clock3 size={13}/>{formatProducerTime(Number(cue.start) || 0)} → {formatProducerTime((Number(cue.start) || 0) + (Number(cue.duration) || 0))}</div>
                <div className={styles.treatment}>{treatment.label}</div>
              </div>

              <div className={styles.preview} data-treatment={safeTreatment}>
                <span className={styles.previewLabel}>AG / MOTION 02</span>
                <strong>{cue.title || "KINETIC PHRASE"}</strong>
                {secondaryLines.length ? <b>{secondaryLines.map((line, lineIndex) => <span key={`${cue.id}-secondary-${lineIndex}`}>{line}</span>)}</b> : null}
                <i aria-hidden="true"/>
              </div>

              <div className={styles.fields}>
                <label><span>Primary phrase</span><input value={cue.title} maxLength={120} onChange={(event) => setDrafts((current) => ({ ...current, [cue.id]: { ...cue, title: event.target.value } }))}/></label>
                <label><span>Secondary line</span><input value={cue.body ?? ""} maxLength={320} placeholder={safeTreatment === "question-stack" ? "QUESTION ONE? | QUESTION TWO?" : "Use | to make intentional support rows"} onChange={(event) => setDrafts((current) => ({ ...current, [cue.id]: { ...cue, body: event.target.value } }))}/></label>
                <label><span>Treatment</span><select value={safeTreatment} onChange={(event) => setDrafts((current) => ({ ...current, [cue.id]: { ...cue, treatment: event.target.value as VideoProducerKineticTreatment } }))}>{TREATMENTS.map((item) => <option value={item.id} key={item.id}>{item.label} · {item.note}</option>)}</select></label>
                <div className={styles.timingFields}>
                  <label><span>Start · sec</span><input type="number" step="0.1" min="0" value={cue.start} onChange={(event) => setDrafts((current) => ({ ...current, [cue.id]: { ...cue, start: Number(event.target.value) } }))}/></label>
                  <label><span>Duration · sec</span><input type="number" step="0.1" min="0.5" max="15" value={cue.duration} onChange={(event) => setDrafts((current) => ({ ...current, [cue.id]: { ...cue, duration: Number(event.target.value) } }))}/></label>
                </div>
              </div>

              <div className={styles.footer}>
                <span><Sparkles size={13}/> A-roll phrase → moving field → {treatment.label.toLowerCase()} composition → return</span>
                <button onClick={() => void save(cue.id)} disabled={Boolean(busy) || !cue.title.trim()}>{busy === cue.id ? <Loader2 size={14}/> : <Check size={14}/>} Save cue</button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
