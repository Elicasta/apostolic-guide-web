"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Scissors, Smartphone, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { formatProducerTime } from "@/video-producer";
import type { VideoProducerReelCandidate } from "@/video-producer-ai";
import { VideoProducerReelsLibrary } from "@/video-producer-reels-library";
import styles from "./video-producer-sequential.module.css";

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
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) }
  });
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
    try {
      const next = await requestJson<ProjectDetail>(`/api/admin/video-producer/projects/${projectId}`);
      setDetail(next);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Reels package could not be loaded.");
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  const project = detail?.project;
  if (!project || project.mode !== "podcast" || !["approved", "rendering", "review", "completed"].includes(project.status)) return null;
  const candidates = project.reel_candidates ?? [];

  async function findReels() {
    setBusy("find"); setError("");
    try {
      const result = await requestJson<{ candidates: VideoProducerReelCandidate[] }>("/api/admin/video-producer/reel-candidates", {
        method: "POST", body: JSON.stringify({ projectId })
      });
      setDetail((current) => current?.project ? { ...current, project: { ...current.project, reel_candidates: result.candidates } } : current);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Reel candidates could not be generated.");
    } finally { setBusy(null); }
  }

  async function createReel(candidate: VideoProducerReelCandidate) {
    setBusy(candidate.id); setError("");
    try {
      const result = await requestJson<{ project: { id: string } }>("/api/admin/video-producer/reels-from-podcast", {
        method: "POST", body: JSON.stringify({ projectId, candidateId: candidate.id })
      });
      router.push(`/admin/video-producer/${result.project.id}/produce`);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Reel project could not be created.");
      setBusy(null);
    }
  }

  return (
    <div className={styles.flowAddon}>
      <div className={styles.flowShell}>
        <VideoProducerReelsLibrary parentProjectId={projectId} embedded/>
        <section className={styles.workspace} style={{ marginTop: 16 }} aria-label="Create reels from podcast">
          <header className={styles.workspaceHeader}>
            <div className={styles.workspaceHeaderRow}>
              <div>
                <div className={styles.eyebrow}>Add to the package</div>
                <h2>Find more Reels</h2>
                <p>Sol finds self-contained moments in the same raw recording. Choosing one creates a child Reel, keeps it attached to this Podcast, and opens its Produce step.</p>
              </div>
              <span className={styles.statusPill}><Smartphone size={12}/> {candidates.length ? `${candidates.length} found` : "Optional"}</span>
            </div>
          </header>
          <div className={styles.workspaceBody}>
            {error ? <div className={`${styles.notice} ${styles.warning}`} style={{ marginBottom: 12 }}>{error}</div> : null}
            <button className={styles.buttonSecondary} disabled={Boolean(busy)} onClick={() => void findReels()}>
              {busy === "find" ? <Loader2 size={14} className={styles.spin}/> : <Sparkles size={14}/>} {candidates.length ? "Regenerate candidates" : "Find reels"}
            </button>
            {candidates.length ? <div className={styles.decisionList} style={{ marginTop: 14 }}>{candidates.map((candidate) => (
              <div className={styles.panel} key={candidate.id} style={{ padding: 14 }}>
                <div className={styles.panelHeadingRow}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className={styles.eyebrow}>{formatProducerTime(candidate.start)}–{formatProducerTime(candidate.end)} · {candidate.score}/100</div>
                    <h3 style={{ margin: "6px 0 0", fontSize: 14 }}>{candidate.title}</h3>
                    <p className={styles.panelText} style={{ marginTop: 5 }}>{candidate.hook}</p>
                  </div>
                  <button className={styles.buttonSecondary} disabled={Boolean(busy)} onClick={() => void createReel(candidate)}>
                    {busy === candidate.id ? <Loader2 size={14} className={styles.spin}/> : <Scissors size={14}/>} Create reel
                  </button>
                </div>
              </div>
            ))}</div> : null}
          </div>
        </section>
      </div>
    </div>
  );
}
