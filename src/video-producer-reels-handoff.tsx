"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Scissors, Smartphone, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { formatProducerTime } from "@/video-producer";
import type { VideoProducerReelCandidate } from "@/video-producer-ai";
import { VideoProducerReelsLibrary } from "@/video-producer-reels-library";
import styles from "./video-producer-library.module.css";

type ProjectDetail = {
  project?: {
    id: string;
    title: string;
    mode: "podcast" | "reels";
    status: string;
    reel_candidates?: VideoProducerReelCandidate[] | null;
  } | null;
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store", headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data as T;
}

export function VideoProducerReelsHandoff({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try { setDetail(await requestJson<ProjectDetail>(`/api/admin/video-producer/projects/${projectId}`)); setError(""); }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Reels package could not be loaded."); }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);
  const project = detail?.project;
  if (!project || project.mode !== "podcast" || !["approved", "rendering", "review", "completed"].includes(project.status)) return null;
  const candidates = project.reel_candidates ?? [];

  async function findReels() {
    setBusy("find"); setError("");
    try {
      const result = await requestJson<{ candidates: VideoProducerReelCandidate[] }>("/api/admin/video-producer/reel-candidates", { method: "POST", body: JSON.stringify({ projectId }) });
      setDetail((current) => current?.project ? { ...current, project: { ...current.project, reel_candidates: result.candidates } } : current);
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Reel candidates could not be generated."); }
    finally { setBusy(null); }
  }

  async function createReel(candidate: VideoProducerReelCandidate) {
    setBusy(candidate.id); setError("");
    try {
      const result = await requestJson<{ project: { id: string } }>("/api/admin/video-producer/reels-from-podcast", { method: "POST", body: JSON.stringify({ projectId, candidateId: candidate.id }) });
      router.push(`/admin/video-producer/${result.project.id}/produce`);
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Reel project could not be created."); setBusy(null); }
  }

  return (
    <div className={styles.handoff}>
      <VideoProducerReelsLibrary parentProjectId={projectId} embedded/>

      <details className={styles.candidateDetails} open={false}>
        <summary>
          <span className={styles.candidateSummary}>
            <Smartphone size={16}/>
            <span><strong>Find more Reels</strong><small>Optional · Sol scans this Podcast for self-contained moments</small></span>
          </span>
          <span className={styles.count}>{candidates.length || 0}</span>
        </summary>
        <div className={styles.candidateBody}>
          {error ? <div className={styles.error}>{error}</div> : null}
          <button className={styles.secondaryButton} disabled={Boolean(busy)} onClick={() => void findReels()}>{busy === "find" ? <Loader2 size={14} className={styles.spin}/> : <Sparkles size={14}/>} {candidates.length ? "Regenerate candidates" : "Find reels"}</button>
          {candidates.length ? <div className={styles.candidateList}>{candidates.map((candidate) => (
            <div className={styles.candidateRow} key={candidate.id}>
              <div className={styles.candidateCopy}>
                <small>{formatProducerTime(candidate.start)}–{formatProducerTime(candidate.end)} · {candidate.score}/100</small>
                <strong>{candidate.title}</strong>
                <p>{candidate.hook}</p>
              </div>
              <button className={styles.rowAction} disabled={Boolean(busy)} onClick={() => void createReel(candidate)}>{busy === candidate.id ? <Loader2 size={13} className={styles.spin}/> : <Scissors size={13}/>} Create</button>
            </div>
          ))}</div> : null}
        </div>
      </details>
    </div>
  );
}
