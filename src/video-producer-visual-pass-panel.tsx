"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Film, Loader2, Search, SkipForward, Sparkles } from "lucide-react";
import { formatProducerTime } from "@/video-producer";
import styles from "./video-producer-visual-pass.module.css";

type Beat = {
  id: string;
  source_start: number;
  duration: number;
  dialogue: string;
  recommendation: "a-roll" | "punch-in" | "camera-b" | "scripture" | "graphic" | "b-roll";
  intent: string;
  search_queries: string[];
  vocabulary: string;
  preferred_style?: string | null;
  status: "open" | "searching" | "resolved" | "skipped";
};

type Candidate = {
  id: string;
  beat_id: string;
  provider: "ag-library" | "pexels" | "pixabay";
  title: string;
  preview_url?: string | null;
  source_url?: string | null;
  creator?: string | null;
  duration?: number | null;
  width?: number | null;
  height?: number | null;
  score?: number | null;
  license_name?: string | null;
};

type Placement = {
  id: string;
  beat_id: string;
  source_start: number;
  source_end: number;
  asset?: { id: string; filename: string; source_provider: string; creator?: string | null } | null;
};

type ImportJob = { id: string; beat_id: string; provider: string; status: string; progress?: { percent?: number; stage?: string } | null; error?: string | null };
type GenerationJob = { id: string; beat_id: string; provider: string; status: string; error?: string | null };
type VisualState = {
  project: { id: string; title: string; mode: "podcast" | "reels"; status: string };
  beats: Beat[];
  placements: Placement[];
  importJobs: ImportJob[];
  generationJobs: GenerationJob[];
  providers: { pexels: boolean; pixabay: boolean; runway: boolean; firefly: boolean };
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store", headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data as T;
}

function recommendationLabel(value: Beat["recommendation"]) {
  const labels: Record<Beat["recommendation"], string> = {
    "a-roll": "A-roll",
    "punch-in": "Punch in",
    "camera-b": "Camera B",
    scripture: "Scripture",
    graphic: "Graphic",
    "b-roll": "B-roll"
  };
  return labels[value];
}

function providerLabel(value: Candidate["provider"] | string) {
  if (value === "ag-library") return "AG LIBRARY";
  return value.toUpperCase();
}

export function VideoProducerVisualPassPanel({ projectId }: { projectId: string }) {
  const [state, setState] = useState<VisualState | null>(null);
  const [candidates, setCandidates] = useState<Record<string, Candidate[]>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pollingGeneration, setPollingGeneration] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const data = await api<VisualState>(`/api/admin/video-producer/visual-pass?projectId=${encodeURIComponent(projectId)}`);
      setState(data);
      setError("");
      const active = Object.fromEntries((data.generationJobs ?? [])
        .filter((job) => ["queued", "generating", "succeeded", "importing"].includes(job.status))
        .map((job) => [job.beat_id, job.id]));
      setPollingGeneration((current) => ({ ...active, ...current }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Visual Pass could not be loaded.");
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  const hasWorkingImports = useMemo(() => Boolean(state?.importJobs.some((job) => ["queued", "downloading", "normalizing", "uploading"].includes(job.status))), [state?.importJobs]);
  useEffect(() => {
    if (!hasWorkingImports) return;
    const timer = window.setInterval(() => void load(), 3500);
    return () => window.clearInterval(timer);
  }, [hasWorkingImports, load]);

  useEffect(() => {
    const entries = Object.entries(pollingGeneration);
    if (!entries.length) return;
    const timer = window.setInterval(() => {
      void Promise.all(entries.map(async ([beatId, jobId]) => {
        try {
          const result = await api<{ generationJob: GenerationJob; importJob?: ImportJob | null }>(`/api/admin/video-producer/visual-pass/generate?jobId=${encodeURIComponent(jobId)}`);
          if (["failed", "cancelled", "completed", "importing"].includes(result.generationJob.status)) {
            setPollingGeneration((current) => {
              const next = { ...current };
              delete next[beatId];
              return next;
            });
            if (result.generationJob.status === "failed") setError(result.generationJob.error || "Generated visual failed.");
            void load();
          }
        } catch (pollError) {
          setError(pollError instanceof Error ? pollError.message : "Generation status could not be refreshed.");
        }
      }));
    }, 5000);
    return () => window.clearInterval(timer);
  }, [load, pollingGeneration]);

  async function analyze() {
    setBusy("analyze"); setError(""); setMessage("Sol is mapping visual beats across the timestamped teaching…");
    try {
      const result = await api<{ beats: Beat[]; summary: string }>("/api/admin/video-producer/visual-pass", { method: "POST", body: JSON.stringify({ projectId }) });
      setMessage(`Visual Pass ready · ${result.beats.length} editorial decisions.`);
      await load();
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Visual Pass analysis failed."); }
    finally { setBusy(null); }
  }

  async function searchBeat(beatId: string) {
    setBusy(`search:${beatId}`); setError("");
    try {
      const result = await api<{ candidates: Candidate[] }>("/api/admin/video-producer/visual-pass/search", { method: "POST", body: JSON.stringify({ beatId }) });
      setCandidates((current) => ({ ...current, [beatId]: result.candidates }));
      setMessage(result.candidates.length ? `Found ${result.candidates.length} real-footage options. AG-owned media is ranked first.` : "No useful real-footage match. Generate an editorial insert or keep the A-roll.");
      await load();
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Footage search failed."); }
    finally { setBusy(null); }
  }

  async function useCandidate(beatId: string, candidateId: string) {
    setBusy(`use:${candidateId}`); setError(""); setMessage("Preparing the selected shot for the AG media bin…");
    try {
      const result = await api<{ imported: boolean }>("/api/admin/video-producer/visual-pass/use", { method: "POST", body: JSON.stringify({ candidateId }) });
      setCandidates((current) => ({ ...current, [beatId]: [] }));
      setMessage(result.imported ? "Selected footage is downloading, normalizing, hashing, and moving into private AG storage." : "AG library shot placed provisionally over A-roll.");
      await load();
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Selected footage could not be used."); }
    finally { setBusy(null); }
  }

  async function generateBeat(beatId: string) {
    setBusy(`generate:${beatId}`); setError(""); setMessage("Starting a restrained editorial insert in Runway…");
    try {
      const result = await api<{ generationJob: GenerationJob }>("/api/admin/video-producer/visual-pass/generate", { method: "POST", body: JSON.stringify({ beatId }) });
      setPollingGeneration((current) => ({ ...current, [beatId]: result.generationJob.id }));
      setMessage("Generation started. When Runway finishes, the output will be copied into permanent AG storage before its provider URL expires.");
      await load();
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Generated visual could not start."); }
    finally { setBusy(null); }
  }

  async function skipBeat(beatId: string) {
    setBusy(`skip:${beatId}`); setError("");
    try {
      await api("/api/admin/video-producer/visual-pass/beat", { method: "PATCH", body: JSON.stringify({ beatId, status: "skipped" }) });
      setCandidates((current) => ({ ...current, [beatId]: [] }));
      setMessage("Beat skipped. A-roll remains authoritative.");
      await load();
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Beat could not be skipped."); }
    finally { setBusy(null); }
  }

  if (!state) return <section className={styles.panel}><div className={styles.loading}><Loader2 size={18}/> Loading Visual Pass…</div></section>;
  const placementByBeat = new Map(state.placements.map((placement) => [placement.beat_id, placement]));
  const importByBeat = new Map(state.importJobs.map((job) => [job.beat_id, job]));
  const generatedByBeat = new Map(state.generationJobs.map((job) => [job.beat_id, job]));

  return (
    <section className={styles.panel}>
      <header className={styles.header}>
        <div>
          <div className={styles.eyebrow}>VISUAL PASS</div>
          <h2>Assembly authority, not final-cut authority.</h2>
          <p>Sol maps the teaching, searches AG-owned footage first, then Pexels and Pixabay. Generate only when real footage or a graphic will not do the job.</p>
        </div>
        <button className={styles.primary} onClick={analyze} disabled={Boolean(busy) || state.project.status === "rendering"}>
          {busy === "analyze" ? <Loader2 size={16}/> : <Sparkles size={16}/>} {state.beats.length ? "Re-analyze" : "Analyze episode"}
        </button>
      </header>

      <div className={styles.providers}>
        <span className={styles.providerOn}>AG LIBRARY · FIRST</span>
        <span className={state.providers.pexels ? styles.providerOn : styles.providerOff}>PEXELS</span>
        <span className={state.providers.pixabay ? styles.providerOn : styles.providerOff}>PIXABAY</span>
        <span className={state.providers.runway ? styles.providerOn : styles.providerOff}>RUNWAY · AI FALLBACK</span>
        <span className={state.providers.firefly ? styles.providerOn : styles.providerOff}>FIREFLY · SAFE FALLBACK</span>
      </div>

      {message ? <div className={styles.message}>{message}</div> : null}
      {error ? <div className={styles.error}>{error}</div> : null}

      {!state.beats.length ? (
        <div className={styles.empty}>
          <Film size={22}/>
          <strong>No visual beat map yet.</strong>
          <span>Run this after the Sol edit pass. It uses the timestamped A-roll transcript and current pacing rules.</span>
        </div>
      ) : (
        <div className={styles.beats}>
          {state.beats.map((beat) => {
            const placement = placementByBeat.get(beat.id);
            const importJob = importByBeat.get(beat.id);
            const generationJob = generatedByBeat.get(beat.id);
            const beatCandidates = candidates[beat.id] ?? [];
            const isWorking = Boolean(importJob && ["queued", "downloading", "normalizing", "uploading"].includes(importJob.status)) || Boolean(pollingGeneration[beat.id]);
            return (
              <article className={`${styles.beat} ${beat.status === "skipped" ? styles.skipped : ""}`} key={beat.id}>
                <div className={styles.time}>{formatProducerTime(beat.source_start)}</div>
                <div className={styles.beatBody}>
                  <div className={styles.beatTopline}>
                    <span className={`${styles.recommendation} ${beat.recommendation === "b-roll" ? styles.broll : ""}`}>{recommendationLabel(beat.recommendation)}</span>
                    <span>{beat.vocabulary.replaceAll("-", " ")}</span>
                    {beat.status === "resolved" ? <span className={styles.resolved}><Check size={13}/> resolved</span> : null}
                    {beat.status === "skipped" ? <span>skipped</span> : null}
                  </div>
                  <blockquote>“{beat.dialogue}”</blockquote>
                  <p className={styles.intent}>{beat.intent}</p>
                  {beat.search_queries?.length ? <div className={styles.queries}>{beat.search_queries.map((query) => <span key={query}>{query}</span>)}</div> : null}

                  {placement ? (
                    <div className={styles.placement}>
                      <Check size={16}/>
                      <div><strong>{placement.asset?.filename || "Visual selected"}</strong><span>{placement.asset?.source_provider?.toUpperCase()} · V2 provisional placement · A-roll audio continues</span></div>
                    </div>
                  ) : null}
                  {importJob && ["queued", "downloading", "normalizing", "uploading"].includes(importJob.status) ? (
                    <div className={styles.working}><Loader2 size={15}/><span>{importJob.progress?.stage || "Preparing media"} · {Math.round(importJob.progress?.percent || 0)}%</span></div>
                  ) : null}
                  {generationJob && ["queued", "generating", "succeeded", "importing"].includes(generationJob.status) ? (
                    <div className={styles.working}><Loader2 size={15}/><span>AI insert · {generationJob.status}</span></div>
                  ) : null}

                  {beat.recommendation === "b-roll" && beat.status !== "skipped" && !placement ? (
                    <div className={styles.actions}>
                      <button onClick={() => searchBeat(beat.id)} disabled={Boolean(busy) || isWorking}><Search size={15}/>{busy === `search:${beat.id}` ? "Searching…" : "Search real footage"}</button>
                      <button onClick={() => generateBeat(beat.id)} disabled={Boolean(busy) || isWorking || !state.providers.runway}><Sparkles size={15}/>{busy === `generate:${beat.id}` ? "Starting…" : "Generate"}</button>
                      <button onClick={() => skipBeat(beat.id)} disabled={Boolean(busy) || isWorking}><SkipForward size={15}/>Stay on A-roll</button>
                    </div>
                  ) : null}

                  {beatCandidates.length ? (
                    <div className={styles.candidates}>
                      {beatCandidates.map((candidate) => (
                        <div className={styles.candidate} key={candidate.id}>
                          {candidate.preview_url ? <img src={candidate.preview_url} alt=""/> : <div className={styles.noPreview}><Film size={22}/></div>}
                          <div className={styles.candidateBody}>
                            <div className={styles.candidateProvider}>{providerLabel(candidate.provider)}</div>
                            <strong>{candidate.title}</strong>
                            <span>{candidate.duration ? `${Math.round(candidate.duration)} sec` : "Video"}{candidate.creator ? ` · ${candidate.creator}` : ""}</span>
                            <span>{candidate.license_name || "Source metadata recorded on use"}</span>
                            <div className={styles.candidateActions}>
                              {candidate.source_url ? <a href={candidate.source_url} target="_blank" rel="noreferrer">Source</a> : null}
                              <button onClick={() => useCandidate(beat.id, candidate.id)} disabled={Boolean(busy)}>{busy === `use:${candidate.id}` ? <Loader2 size={14}/> : <Check size={14}/>} Use</button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
