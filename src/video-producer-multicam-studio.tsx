"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { upload } from "@vercel/blob/client";
import { ArrowLeft, Check, Plus, RefreshCw, Trash2, Waves } from "lucide-react";
import {
  VIDEO_PRODUCER_PRIMARY_CAMERA_ID,
  getVideoProducerMulticamMetadata,
  type VideoProducerCameraDecision
} from "@/video-producer-multicam";
import { formatProducerTime } from "@/video-producer";
import styles from "./video-producer-multicam.module.css";

const MULTIPART_THRESHOLD_BYTES = 100 * 1024 * 1024;

type Detail = {
  project: {
    id: string;
    title: string;
    status: string;
    parent_project_id: string | null;
    source_filename: string | null;
    source_duration: number | null;
    director_metadata: unknown;
  };
  sourcePreviewUrl: string | null;
  multicamPreview?: { cameraPreviewUrls?: Record<string, string>; externalAudioPreviewUrl?: string | null };
};

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(-140) || "source";
}

async function json<T = unknown>(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, headers: { "content-type": "application/json", ...(init?.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : `Request failed (${response.status})`);
  return data as T;
}

function Waveform({ values }: { values: number[] }) {
  if (!values.length) return <div className={styles.waveformEmpty}>Waveform appears after sync.</div>;
  return <div className={styles.waveform} aria-label="Audio waveform">{values.map((value, index) => <i key={index} style={{ height: `${Math.max(3, value)}%` }}/>)}</div>;
}

function confidence(value: number | undefined) {
  if (value == null) return "Not measured";
  return `${Math.round(value * 100)}% match`;
}

export function VideoProducerMulticamStudio({ projectId }: { projectId: string }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [uploadPercent, setUploadPercent] = useState<Record<string, number>>({});
  const [decisions, setDecisions] = useState<VideoProducerCameraDecision[]>([]);
  const [manualOffsets, setManualOffsets] = useState<Record<string, string>>({});
  const [externalOffset, setExternalOffset] = useState("");

  const load = useCallback(async () => {
    const next = await json<Detail>(`/api/admin/video-producer/projects/${projectId}`);
    setDetail(next);
    return next;
  }, [projectId]);

  useEffect(() => { void load().catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Project could not load.")); }, [load]);
  const multicam = useMemo(() => getVideoProducerMulticamMetadata(detail?.project.director_metadata), [detail?.project.director_metadata]);

  useEffect(() => { setDecisions(multicam.editDecisions); }, [multicam.editDecisions]);
  useEffect(() => {
    const offsets: Record<string, string> = {};
    for (const camera of multicam.cameras) if (Number.isFinite(multicam.analysis.cameraOffsetsMs[camera.id])) offsets[camera.id] = String(Math.round(multicam.analysis.cameraOffsetsMs[camera.id]));
    setManualOffsets(offsets);
    setExternalOffset(Number.isFinite(multicam.analysis.externalAudioOffsetMs) ? String(Math.round(multicam.analysis.externalAudioOffsetMs!)) : "");
  }, [multicam.analysis.cameraOffsetsMs, multicam.analysis.externalAudioOffsetMs, multicam.cameras]);

  useEffect(() => {
    if (!detail || !["queued", "analyzing"].includes(multicam.analysis.status)) return;
    const timer = window.setInterval(() => void load().catch(() => undefined), 3000);
    return () => window.clearInterval(timer);
  }, [detail, load, multicam.analysis.status]);

  async function waitForUploadCompletion() {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 700 + attempt * 250));
      const next = await load();
      const current = getVideoProducerMulticamMetadata(next.project.director_metadata);
      if (current.cameras.length || current.externalAudio) return;
    }
  }

  async function uploadCamera(file: File) {
    const index = multicam.cameras.length;
    const sourceId = `camera-${crypto.randomUUID().slice(0, 10)}`;
    const label = `Camera ${String.fromCharCode(66 + Math.min(index, 24))}`;
    const mime = file.type || (file.name.toLowerCase().endsWith(".mov") ? "video/quicktime" : "video/mp4");
    setBusy(sourceId); setError(""); setMessage(`Uploading ${label}…`);
    try {
      await upload(`video-producer/sources/${projectId}/cameras/${sourceId}/${safeName(file.name)}`, file, {
        access: "private",
        handleUploadUrl: "/api/admin/video-producer/upload",
        multipart: file.size >= MULTIPART_THRESHOLD_BYTES,
        contentType: mime,
        clientPayload: JSON.stringify({ projectId, filename: file.name, contentType: mime, size: file.size, sourceKind: "camera", sourceId, sourceLabel: label }),
        onUploadProgress(event) { setUploadPercent((current) => ({ ...current, [sourceId]: Math.round(event.percentage) })); }
      });
      await waitForUploadCompletion();
      setMessage(`${label} added. Run waveform sync before Smart Auto Cut.`);
    } catch (uploadError) { setError(uploadError instanceof Error ? uploadError.message : "Camera upload failed."); }
    finally { setBusy(null); }
  }

  async function uploadExternalAudio(file: File) {
    const name = file.name.toLowerCase();
    const mime = file.type || (name.endsWith(".wav") ? "audio/wav" : name.endsWith(".m4a") ? "audio/x-m4a" : "audio/mpeg");
    setBusy("external-audio"); setError(""); setMessage("Uploading external audio…");
    try {
      await upload(`video-producer/sources/${projectId}/external-audio/${safeName(file.name)}`, file, {
        access: "private",
        handleUploadUrl: "/api/admin/video-producer/upload",
        multipart: file.size >= MULTIPART_THRESHOLD_BYTES,
        contentType: mime,
        clientPayload: JSON.stringify({ projectId, filename: file.name, contentType: mime, size: file.size, sourceKind: "external_audio" }),
        onUploadProgress(event) { setUploadPercent((current) => ({ ...current, "external-audio": Math.round(event.percentage) })); }
      });
      await waitForUploadCompletion();
      setMessage("External audio added. Waveform sync will align it to Camera A.");
    } catch (uploadError) { setError(uploadError instanceof Error ? uploadError.message : "External audio upload failed."); }
    finally { setBusy(null); }
  }

  async function syncWaveforms() {
    setBusy("sync"); setError(""); setMessage("Analyzing waveform timing. You can leave this screen while the worker runs.");
    try {
      await json("/api/admin/video-producer/multicam/analyze", { method: "POST", body: JSON.stringify({ projectId }) });
      await load();
    } catch (syncError) { setError(syncError instanceof Error ? syncError.message : "Waveform sync could not start."); }
    finally { setBusy(null); }
  }

  async function saveManualSync() {
    const cameraOffsetsMs = Object.fromEntries(Object.entries(manualOffsets).flatMap(([id, value]) => value.trim() && Number.isFinite(Number(value)) ? [[id, Number(value)]] : []));
    setBusy("manual-sync"); setError("");
    try {
      await json("/api/admin/video-producer/multicam", { method: "PATCH", body: JSON.stringify({ projectId, action: "manual-sync", cameraOffsetsMs, externalAudioOffsetMs: externalOffset.trim() ? Number(externalOffset) : null }) });
      setMessage("Manual sync offsets saved."); await load();
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Manual sync could not be saved."); }
    finally { setBusy(null); }
  }

  async function regenerate() {
    setBusy("regenerate"); setError("");
    try {
      await json("/api/admin/video-producer/multicam", { method: "PATCH", body: JSON.stringify({ projectId, action: "regenerate" }) });
      setMessage("Smart Auto Cut regenerated from transcript timing and the synced camera set."); await load();
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Smart Auto Cut failed."); }
    finally { setBusy(null); }
  }

  async function saveDecisions() {
    setBusy("decisions"); setError("");
    try {
      await json("/api/admin/video-producer/multicam", { method: "PATCH", body: JSON.stringify({ projectId, action: "update-decisions", decisions }) });
      setMessage("Camera decisions saved. Final approval will fingerprint this exact timeline."); await load();
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Camera decisions could not be saved."); }
    finally { setBusy(null); }
  }

  async function removeSource(sourceId: string) {
    setBusy(`remove-${sourceId}`); setError("");
    try {
      await json("/api/admin/video-producer/multicam", { method: "PATCH", body: JSON.stringify({ projectId, action: "remove-source", sourceId }) });
      setMessage("Source removed and affected camera cuts fell back to Camera A."); await load();
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Source could not be removed."); }
    finally { setBusy(null); }
  }

  if (!detail) return <main className={styles.page}><div className={styles.shell}><p className={styles.loading}>Loading multicam workspace…</p></div></main>;
  if (detail.project.parent_project_id) return <main className={styles.page}><div className={styles.shell}><Link className={styles.back} href={`/admin/video-producer/${projectId}/source`}><ArrowLeft size={14}/> Back</Link><div className={styles.notice}>Reels inherit the parent production. Change multicam on the long-form project.</div></div></main>;

  const previewUrls = detail.multicamPreview?.cameraPreviewUrls || {};
  const syncReady = multicam.analysis.status === "ready";
  const sourceOptions = [{ id: VIDEO_PRODUCER_PRIMARY_CAMERA_ID, label: "Camera A" }, ...multicam.cameras.map((camera) => ({ id: camera.id, label: camera.label }))];

  return <main className={styles.page}><div className={styles.shell}>
    <div className={styles.topline}><Link className={styles.back} href={`/admin/video-producer/${projectId}/source`}><ArrowLeft size={14}/> Source</Link><span>{detail.project.title}</span></div>
    <header className={styles.header}><div><small>VIDEO PRODUCER</small><h1>Multicam + Sync</h1><p>Camera A keeps the existing fast path. Add Camera B, C, or more only when the production needs them.</p></div><Link className={styles.primaryLink} href={`/admin/video-producer/${projectId}/produce`}>Continue to Produce</Link></header>
    {error ? <div className={styles.error}>{error}</div> : null}{message ? <div className={styles.notice}>{message}</div> : null}

    <section className={styles.section}><div className={styles.sectionHead}><div><h2>Camera sources</h2><p>Camera A is the master timeline. Every added camera is aligned to it by audio waveform.</p></div><label className={styles.addButton}><Plus size={14}/> Add camera<input type="file" accept="video/*" disabled={Boolean(busy)} onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void uploadCamera(file); event.currentTarget.value = ""; }}/></label></div>
      <div className={styles.cameraGrid}>
        <article className={styles.cameraCard}><div className={styles.cardTitle}><strong>Camera A</strong><span>Master</span></div>{detail.sourcePreviewUrl ? <video controls preload="metadata" src={detail.sourcePreviewUrl}/> : <div className={styles.mediaMissing}>Primary source unavailable</div>}<p>{detail.project.source_filename || "Primary source"}</p><Waveform values={multicam.analysis.waveforms[VIDEO_PRODUCER_PRIMARY_CAMERA_ID] || []}/></article>
        {multicam.cameras.map((camera) => <article className={styles.cameraCard} key={camera.id}><div className={styles.cardTitle}><strong>{camera.label}</strong><button onClick={() => void removeSource(camera.id)} disabled={Boolean(busy)} aria-label={`Remove ${camera.label}`}><Trash2 size={13}/></button></div>{previewUrls[camera.id] ? <video controls preload="metadata" src={previewUrls[camera.id]}/> : <div className={styles.mediaMissing}>{busy === camera.id ? `Uploading ${uploadPercent[camera.id] || 0}%` : "Preview loading"}</div>}<p>{camera.filename}</p><Waveform values={multicam.analysis.waveforms[camera.id] || []}/><div className={styles.syncMeta}><span>{Number.isFinite(multicam.analysis.cameraOffsetsMs[camera.id]) ? `${Math.round(multicam.analysis.cameraOffsetsMs[camera.id])} ms` : "Not synced"}</span><span>{confidence(multicam.analysis.cameraConfidence[camera.id])}</span></div></article>)}
      </div>
    </section>

    <section className={styles.section}><div className={styles.sectionHead}><div><h2>External audio</h2><p>Optional. Recorder audio becomes the voice master wherever its synced timeline overlaps Camera A.</p></div>{multicam.externalAudio ? <button className={styles.iconButton} onClick={() => void removeSource("external-audio")} disabled={Boolean(busy)}><Trash2 size={14}/></button> : <label className={styles.addButton}><Plus size={14}/> Add audio<input type="file" accept="audio/*" disabled={Boolean(busy)} onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void uploadExternalAudio(file); event.currentTarget.value = ""; }}/></label>}</div>
      {multicam.externalAudio ? <div className={styles.audioCard}><div><strong>{multicam.externalAudio.filename}</strong><span>{Number.isFinite(multicam.analysis.externalAudioOffsetMs) ? `${Math.round(multicam.analysis.externalAudioOffsetMs!)} ms · ${confidence(multicam.analysis.externalAudioConfidence ?? undefined)}` : "Not synced"}</span></div>{detail.multicamPreview?.externalAudioPreviewUrl ? <audio controls src={detail.multicamPreview.externalAudioPreviewUrl}/> : null}<Waveform values={multicam.analysis.waveforms["external-audio"] || []}/></div> : <div className={styles.empty}>Camera A audio stays unchanged when no external recorder is added.</div>}
    </section>

    {(multicam.cameras.length > 0 || multicam.externalAudio) ? <section className={styles.section}><div className={styles.sectionHead}><div><h2><Waves size={17}/> Waveform sync</h2><p>Positive offset means that source started later than Camera A. Automatic sync is cached in this project.</p></div><button className={styles.primaryButton} onClick={() => void syncWaveforms()} disabled={Boolean(busy) || ["queued", "analyzing"].includes(multicam.analysis.status)}>{["queued", "analyzing"].includes(multicam.analysis.status) ? <><RefreshCw className={styles.spin} size={14}/> Syncing</> : "Sync by waveform"}</button></div>
      {multicam.analysis.status === "failed" ? <div className={styles.error}>{multicam.analysis.error || "Waveform sync failed. Use manual offsets or retry."}</div> : null}
      <details className={styles.manual}><summary>Manual sync fallback</summary><div className={styles.manualGrid}>{multicam.cameras.map((camera) => <label key={camera.id}><span>{camera.label} offset, ms</span><input type="number" value={manualOffsets[camera.id] || ""} onChange={(event) => setManualOffsets((current) => ({ ...current, [camera.id]: event.target.value }))}/></label>)}{multicam.externalAudio ? <label><span>External audio offset, ms</span><input type="number" value={externalOffset} onChange={(event) => setExternalOffset(event.target.value)}/></label> : null}<button className={styles.secondaryButton} onClick={() => void saveManualSync()} disabled={busy === "manual-sync"}>Save offsets</button></div></details>
    </section> : null}

    {multicam.cameras.length ? <section className={styles.section}><div className={styles.sectionHead}><div><h2>Smart Auto Cut</h2><p>The producer cleanup happens first. These decisions only choose which synced camera shows during the surviving timeline.</p></div><button className={styles.secondaryButton} onClick={() => void regenerate()} disabled={Boolean(busy) || !syncReady}><RefreshCw size={14}/> Regenerate</button></div>
      {!syncReady ? <div className={styles.empty}>Run waveform sync first. One-camera projects continue using the exact existing renderer with no multicam overhead.</div> : null}
      {decisions.length ? <div className={styles.edl}>{decisions.map((decision, index) => <div className={styles.edlRow} key={decision.id}><span>{String(index + 1).padStart(2, "0")}</span><strong>{formatProducerTime(decision.start)} – {formatProducerTime(decision.end)}</strong><select value={decision.sourceId} onChange={(event) => setDecisions((current) => current.map((item) => item.id === decision.id ? { ...item, sourceId: event.target.value } : item))}>{sourceOptions.map((option) => <option value={option.id} key={option.id}>{option.label}</option>)}</select></div>)}</div> : null}
      {decisions.length ? <div className={styles.actions}><button className={styles.primaryButton} onClick={() => void saveDecisions()} disabled={Boolean(busy)}><Check size={14}/> Save camera edit</button></div> : null}
    </section> : null}
  </div></main>;
}
