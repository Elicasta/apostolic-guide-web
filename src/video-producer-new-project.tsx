"use client";

import { useEffect, useState } from "react";
import { upload } from "@vercel/blob/client";
import { ArrowLeft, Film, Loader2, Smartphone, Upload as UploadIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { VideoProducerMode } from "@/video-producer";
import styles from "./video-producer-sequential.module.css";

const MULTIPART_THRESHOLD_BYTES = 100 * 1024 * 1024;

type Pathway = { slug: string; title: string; summary: string; steps: Array<{ title: string; reference: string }> };

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(-140) || "source.mp4";
}
function titleFromFile(value: string) {
  return value.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim().slice(0, 180) || "Untitled Video";
}
async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data as T;
}

export function VideoProducerNewProject({ initialMode = "podcast" }: { initialMode?: VideoProducerMode }) {
  const router = useRouter();
  const [mode, setMode] = useState<VideoProducerMode>(initialMode);
  const [title, setTitle] = useState("");
  const [pathwaySlug, setPathwaySlug] = useState("");
  const [pathways, setPathways] = useState<Pathway[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void json<{ pathways: Pathway[] }>("/api/admin/video-producer/pathways")
      .then((result) => { if (!cancelled) setPathways(result.pathways ?? []); })
      .catch((loadError) => { if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Pathways could not be loaded."); });
    return () => { cancelled = true; };
  }, []);

  const selectedPathway = pathways.find((pathway) => pathway.slug === pathwaySlug) ?? null;
  const canStart = Boolean(file && (title.trim() || file.name) && (mode === "reels" || pathwaySlug) && !busy);

  async function start() {
    if (!file || !canStart) return;
    setBusy(true); setError(""); setProgress(0); setMessage("Creating project…");
    try {
      const projectTitle = title.trim() || titleFromFile(file.name);
      const created = await json<{ project: { id: string } }>("/api/admin/video-producer/projects", {
        method: "POST",
        body: JSON.stringify({ title: projectTitle, mode, pathwaySlug: mode === "podcast" ? pathwaySlug : undefined })
      });
      const projectId = created.project.id;
      const mime = file.type || (file.name.toLowerCase().endsWith(".mov") ? "video/quicktime" : "video/mp4");
      setMessage("Uploading private source…");
      await upload(`video-producer/sources/${projectId}/${safeName(file.name)}`, file, {
        access: "private",
        handleUploadUrl: "/api/admin/video-producer/upload",
        multipart: file.size >= MULTIPART_THRESHOLD_BYTES,
        contentType: mime,
        clientPayload: JSON.stringify({ projectId, filename: file.name, contentType: mime, size: file.size }),
        onUploadProgress(event) { setProgress(Math.round(event.percentage)); }
      });
      setProgress(100); setMessage("Upload complete. Starting timestamped transcription…");
      await json("/api/admin/video-producer/transcribe", { method: "POST", body: JSON.stringify({ projectId }) });
      router.replace(`/admin/video-producer/${projectId}/source`);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Project could not be started.");
      setBusy(false);
    }
  }

  return (
    <main className={styles.flow}>
      <div className={styles.flowShell}>
        <div className={styles.flowTopline}><Link className={styles.backLink} href="/admin/video-producer"><ArrowLeft size={14}/> Projects</Link></div>
        <section className={styles.workspace}>
          <header className={styles.workspaceHeader}>
            <div className={styles.workspaceHeaderRow}><div><div className={styles.eyebrow}>New project</div><h2>Start with context</h2><p>Set the production lane and, for a podcast, its real pathway before Sol ever sees the transcript. Then upload once.</p></div><span className={styles.statusPill}>Source</span></div>
          </header>
          <div className={styles.workspaceBody}><div className={styles.stack}>
            {error ? <div className={`${styles.notice} ${styles.warning}`}>{error}</div> : null}
            <div className={styles.panel}>
              <h3 className={styles.panelTitle}>Production lane</h3>
              <div className={styles.modeChoice}>
                <button type="button" data-active={mode === "podcast"} disabled={busy} onClick={() => setMode("podcast")}><Film size={19}/><span><strong>Podcast</strong><small>Long-form · 16:9</small></span></button>
                <button type="button" data-active={mode === "reels"} disabled={busy} onClick={() => setMode("reels")}><Smartphone size={19}/><span><strong>Reels</strong><small>Short-form · 9:16</small></span></button>
              </div>
              <div className={styles.field} style={{ marginTop: 14 }}><label>Project title</label><input className={styles.input} disabled={busy} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="God Is One — Episode 01"/></div>
            </div>

            {mode === "podcast" ? <div className={styles.panel}>
              <h3 className={styles.panelTitle}>Episode pathway</h3>
              <p className={styles.panelText}>This becomes the source of truth for Sol’s section structure and Graphics V2 Pathway Stops.</p>
              <select className={styles.select} style={{ marginTop: 12 }} disabled={busy} value={pathwaySlug} onChange={(event) => setPathwaySlug(event.target.value)}>
                <option value="">Choose pathway…</option>{pathways.map((pathway) => <option key={pathway.slug} value={pathway.slug}>{pathway.title}</option>)}
              </select>
              {selectedPathway ? <details className={styles.details} style={{ marginTop: 10 }}><summary>{selectedPathway.steps.length} stops · {selectedPathway.title}</summary><div className={styles.detailsBody}><div className={styles.decisionList}>{selectedPathway.steps.map((step, index) => <div className={styles.decision} key={`${step.reference}-${index}`}><small>Stop {index + 1} · {step.reference}</small><strong>{step.title}</strong></div>)}</div></div></details> : null}
            </div> : null}

            <div className={styles.panel}>
              <h3 className={styles.panelTitle}><UploadIcon size={17}/> Raw recording</h3>
              <p className={styles.panelText}>The browser uploads directly to private storage. Large files use multipart upload; you do not need to keep the app thinking through the media processing.</p>
              <input className={styles.fileInput} disabled={busy} type="file" accept="video/mp4,video/quicktime,video/x-m4v,video/webm,video/mpeg,video/x-msvideo" onChange={(event) => { const next = event.target.files?.[0] ?? null; setFile(next); if (next && !title.trim()) setTitle(titleFromFile(next.name)); }}/>
              {busy ? <div className={styles.progressBox}><div className={styles.progressLine}><span>{message || "Working…"}</span><strong>{progress}%</strong></div><div className={styles.progressTrack}><i style={{ width: `${Math.max(progress, progress ? 3 : 0)}%` }}/></div></div> : null}
            </div>

            <div className={styles.stickyActions}><button className={styles.button} disabled={!canStart} onClick={() => void start()}>{busy ? <Loader2 size={15} className={styles.spin}/> : <UploadIcon size={15}/>} Upload + start project</button></div>
          </div></div>
        </section>
      </div>
    </main>
  );
}
