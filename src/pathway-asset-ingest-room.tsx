"use client";

import { upload } from "@vercel/blob/client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  CircleAlert,
  Clock3,
  FileArchive,
  FileAudio,
  FileText,
  Film,
  Gauge,
  Image as ImageIcon,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud,
  X
} from "lucide-react";
import {
  humanPathwayAssetBytes,
  humanPathwayAssetDuration,
  isSupportedPathwayAssetMime,
  PATHWAY_ASSET_HASH_LIMIT_BYTES,
  PATHWAY_ASSET_MAX_UPLOAD_BYTES,
  pathwayAssetClientFingerprint,
  pathwayAssetDisplayKind,
  pathwayAssetIngestStudio,
  pathwayAssetMediaKind,
  type PathwayAssetIngestStudio
} from "@/pathway-asset-ingest";

type PathwayOption = { slug: string; title: string; summary: string; collection: string };
type QueueStatus = "ready" | "preparing" | "uploading" | "finalizing" | "complete" | "failed" | "cancelled";
type MediaMeta = { width?: number; height?: number; duration?: number };
type QueueItem = {
  id: string;
  file: File;
  status: QueueStatus;
  progress: number;
  bytesUploaded: number;
  speed: number;
  eta: number;
  sessionId?: string;
  actualStudio?: PathwayAssetIngestStudio;
  error?: string;
  duplicateTitle?: string;
  assetId?: string;
  meta?: MediaMeta;
};
type RecoverySession = {
  id: string;
  pathway_slug: string;
  studio: string;
  asset_type: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  status: string;
  bytes_uploaded: number;
  error_message?: string | null;
  expires_at: string;
  updated_at: string;
};

const ACCEPT = [
  "image/png", "image/jpeg", "image/webp",
  "video/mp4", "video/quicktime", "video/x-m4v", "video/webm", "video/mpeg", "video/x-msvideo",
  "audio/mpeg", "audio/wav", "audio/x-wav", "audio/mp4",
  "application/pdf", "application/zip"
].join(",");

function iconFor(mime: string) {
  const kind = pathwayAssetMediaKind(mime);
  if (kind === "video") return <Film size={20}/>;
  if (kind === "audio") return <FileAudio size={20}/>;
  if (kind === "document") return <FileText size={20}/>;
  if (kind === "archive") return <FileArchive size={20}/>;
  return <ImageIcon size={20}/>;
}

async function sha256ForFile(file: File) {
  if (file.size > PATHWAY_ASSET_HASH_LIMIT_BYTES) return undefined;
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function inspectFile(file: File): Promise<MediaMeta> {
  const kind = pathwayAssetMediaKind(file.type);
  if (kind === "image") {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => { resolve({ width: image.naturalWidth, height: image.naturalHeight }); URL.revokeObjectURL(url); };
      image.onerror = () => { resolve({}); URL.revokeObjectURL(url); };
      image.src = url;
    });
  }
  if (kind === "video" || kind === "audio") {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const media = document.createElement(kind === "video" ? "video" : "audio") as HTMLVideoElement | HTMLAudioElement;
      media.preload = "metadata";
      media.onloadedmetadata = () => {
        const video = media as HTMLVideoElement;
        resolve({
          duration: media.duration,
          width: kind === "video" ? video.videoWidth : undefined,
          height: kind === "video" ? video.videoHeight : undefined
        });
        URL.revokeObjectURL(url);
      };
      media.onerror = () => { resolve({}); URL.revokeObjectURL(url); };
      media.src = url;
    });
  }
  return {};
}

async function postAction(body: Record<string, unknown>) {
  const response = await fetch("/api/admin/pathway-assets/ingest", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Ingest request failed (${response.status}).`);
  return data;
}

export function PathwayAssetIngestRoom({
  pathways,
  initialPathwaySlug,
  initialStudio
}: {
  pathways: PathwayOption[];
  initialPathwaySlug: string;
  initialStudio: PathwayAssetIngestStudio;
}) {
  const [pathwaySlug, setPathwaySlug] = useState(initialPathwaySlug);
  const [studio, setStudio] = useState<PathwayAssetIngestStudio>(initialStudio);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [recovery, setRecovery] = useState<RecoverySession[]>([]);
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState("");
  const [runningAll, setRunningAll] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const controllers = useRef(new Map<string, AbortController>());
  const queueRef = useRef(queue);
  useEffect(() => { queueRef.current = queue; }, [queue]);

  const pathway = useMemo(() => pathways.find((item) => item.slug === pathwaySlug) ?? pathways[0], [pathways, pathwaySlug]);
  const totals = useMemo(() => ({
    files: queue.length,
    bytes: queue.reduce((sum, item) => sum + item.file.size, 0),
    complete: queue.filter((item) => item.status === "complete").length,
    active: queue.filter((item) => item.status === "uploading" || item.status === "preparing" || item.status === "finalizing").length
  }), [queue]);

  async function refreshRecovery() {
    if (!pathwaySlug) return;
    const response = await fetch(`/api/admin/pathway-assets/ingest?pathwaySlug=${encodeURIComponent(pathwaySlug)}`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (response.ok) setRecovery(Array.isArray(data.sessions) ? data.sessions : []);
  }

  useEffect(() => { void refreshRecovery(); }, [pathwaySlug]); // eslint-disable-line react-hooks/exhaustive-deps

  function patchItem(id: string, patch: Partial<QueueItem>) {
    setQueue((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  async function addFiles(files: File[]) {
    const accepted: QueueItem[] = [];
    const rejected: string[] = [];
    for (const file of files) {
      if (!isSupportedPathwayAssetMime(file.type)) { rejected.push(`${file.name}: unsupported type`); continue; }
      if (file.size > PATHWAY_ASSET_MAX_UPLOAD_BYTES) { rejected.push(`${file.name}: over ${humanPathwayAssetBytes(PATHWAY_ASSET_MAX_UPLOAD_BYTES)}`); continue; }
      if (queueRef.current.some((item) => item.file.name === file.name && item.file.size === file.size && item.file.lastModified === file.lastModified && item.status !== "cancelled")) continue;
      accepted.push({ id: crypto.randomUUID(), file, status: "ready", progress: 0, bytesUploaded: 0, speed: 0, eta: 0 });
    }
    if (accepted.length) {
      setQueue((current) => [...current, ...accepted]);
      void Promise.all(accepted.map(async (item) => patchItem(item.id, { meta: await inspectFile(item.file) })));
    }
    if (rejected.length) setMessage(rejected.join(" · "));
  }

  async function finalize(sessionId: string) {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try { return await postAction({ action: "finalize", sessionId }); }
      catch (error) {
        lastError = error instanceof Error ? error : new Error("Finalization failed.");
        await new Promise((resolve) => setTimeout(resolve, 650 * (attempt + 1)));
      }
    }
    throw lastError || new Error("Finalization failed.");
  }

  async function startUpload(id: string) {
    const item = queueRef.current.find((entry) => entry.id === id);
    if (!item || ["uploading", "preparing", "finalizing", "complete", "cancelled"].includes(item.status)) return;
    patchItem(id, { status: "preparing", error: undefined, progress: 0, bytesUploaded: 0, speed: 0, eta: 0, sessionId: undefined });
    const startedAt = performance.now();
    try {
      const fingerprint = pathwayAssetClientFingerprint({ name: item.file.name, size: item.file.size, lastModified: item.file.lastModified, mimeType: item.file.type });
      const [sha256, meta] = await Promise.all([sha256ForFile(item.file), item.meta ? Promise.resolve(item.meta) : inspectFile(item.file)]);
      const requestedStudio = pathwayAssetIngestStudio(item.file.type, studio);
      const prepared = await postAction({
        action: "prepare",
        pathwaySlug,
        studio: requestedStudio,
        fileName: item.file.name,
        mimeType: item.file.type,
        fileSize: item.file.size,
        lastModified: item.file.lastModified,
        clientFingerprint: fingerprint,
        sha256,
        mediaMetadata: meta
      });
      const session = prepared.session as Record<string, unknown>;
      const sessionId = String(session.id || "");
      const pathname = String(prepared.pathname || session.storage_path || "");
      if (!sessionId || !pathname) throw new Error("Upload session was prepared without a Blob destination.");
      const duplicateTitle = prepared.duplicateAsset?.title ? String(prepared.duplicateAsset.title) : undefined;
      const controller = new AbortController();
      controllers.current.set(id, controller);
      patchItem(id, {
        sessionId,
        actualStudio: session.studio === "video" ? "video" : "carousel",
        duplicateTitle,
        meta,
        status: "uploading"
      });

      await upload(pathname, item.file, {
        access: "private",
        handleUploadUrl: "/api/admin/pathway-assets/ingest-upload",
        clientPayload: JSON.stringify({ sessionId }),
        contentType: item.file.type,
        multipart: true,
        abortSignal: controller.signal,
        onUploadProgress: ({ loaded, total, percentage }) => {
          const elapsed = Math.max((performance.now() - startedAt) / 1000, .1);
          const speed = loaded / elapsed;
          const remaining = Math.max(total - loaded, 0);
          patchItem(id, {
            status: "uploading",
            bytesUploaded: loaded,
            progress: Math.max(0, Math.min(percentage / 100, 1)),
            speed,
            eta: speed > 0 ? remaining / speed : 0
          });
        }
      });

      controllers.current.delete(id);
      void postAction({ action: "progress", sessionId, bytesUploaded: item.file.size }).catch(() => undefined);
      patchItem(id, { status: "finalizing", progress: 1, bytesUploaded: item.file.size, eta: 0 });
      const result = await finalize(sessionId);
      patchItem(id, {
        status: "complete",
        assetId: String(result.assetId || result.asset?.id || ""),
        progress: 1,
        bytesUploaded: item.file.size,
        speed: 0,
        eta: 0
      });
      void refreshRecovery();
    } catch (error) {
      controllers.current.delete(id);
      if (error instanceof DOMException && error.name === "AbortError") return;
      const current = queueRef.current.find((entry) => entry.id === id);
      const text = error instanceof Error ? error.message : "Upload failed.";
      patchItem(id, { status: "failed", error: text, speed: 0, eta: 0 });
      if (current?.sessionId) void postAction({ action: "fail", sessionId: current.sessionId, bytesUploaded: current.bytesUploaded, error: text }).catch(() => undefined);
      void refreshRecovery();
    }
  }

  async function cancelItem(id: string) {
    const item = queueRef.current.find((entry) => entry.id === id);
    if (!item) return;
    controllers.current.get(id)?.abort();
    controllers.current.delete(id);
    patchItem(id, { status: "cancelled", speed: 0, eta: 0 });
    if (item.sessionId) await postAction({ action: "cancel", sessionId: item.sessionId }).catch(() => undefined);
    void refreshRecovery();
  }

  async function runReady() {
    if (runningAll) return;
    setRunningAll(true);
    try {
      const ids = queueRef.current.filter((item) => item.status === "ready" || item.status === "failed").map((item) => item.id);
      let cursor = 0;
      const worker = async () => {
        while (cursor < ids.length) {
          const current = ids[cursor];
          cursor += 1;
          await startUpload(current);
        }
      };
      await Promise.all([worker(), worker()]);
    } finally {
      setRunningAll(false);
    }
  }

  function removeItem(id: string) {
    const item = queueRef.current.find((entry) => entry.id === id);
    if (item && ["uploading", "preparing", "finalizing"].includes(item.status)) return;
    setQueue((current) => current.filter((entry) => entry.id !== id));
  }

  if (!pathway) return null;

  return <main className="admin-page pathway-ingest-room">
    <div className="pathway-ingest-topline">
      <Link href="/admin/assets" className="button"><ArrowLeft size={15}/> Pathway Assets</Link>
      <span><ShieldCheck size={14}/> Browser → Vercel Blob · app server never proxies upload bytes</span>
    </div>

    <header className="pathway-ingest-hero">
      <div>
        <span className="section-kicker">Source media ingest</span>
        <h1>Bring the <em>master file</em> into the Pathway.</h1>
        <p>Drop original images, long-form video, audio, reference PDFs, and project archives. Large files upload directly to the existing private Vercel Blob store with multipart transfer, automatic part retries, live progress, cancellation, and server-side verification before the DAM registers the source master.</p>
      </div>
      <div className="pathway-ingest-hero-orbit"><UploadCloud size={30}/><span>20 GB</span><small>per source</small></div>
    </header>

    <section className="admin-card pathway-ingest-controls">
      <label><span>Pathway</span><select value={pathwaySlug} onChange={(event) => setPathwaySlug(event.target.value)}>{pathways.map((item) => <option key={item.slug} value={item.slug}>{item.title}</option>)}</select></label>
      <div><span>Primary production lane</span><div className="pathway-ingest-lanes"><button type="button" className={studio === "carousel" ? "is-active" : ""} onClick={() => setStudio("carousel")}><ImageIcon size={15}/> Carousel + Social</button><button type="button" className={studio === "video" ? "is-active" : ""} onClick={() => setStudio("video")}><Film size={15}/> Video Production</button></div></div>
      <p><strong>{pathway.title}</strong><span>{pathway.summary}</span></p>
    </section>

    <section
      className={`pathway-ingest-drop ${dragging ? "is-dragging" : ""}`}
      onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => { event.preventDefault(); if (event.currentTarget === event.target) setDragging(false); }}
      onDrop={(event) => { event.preventDefault(); setDragging(false); void addFiles(Array.from(event.dataTransfer.files)); }}
    >
      <div className="pathway-ingest-drop-icon"><UploadCloud size={27}/></div>
      <div><strong>Drop source masters here</strong><p>Images · MP4/MOV/WebM · MP3/WAV · PDF · ZIP</p><small>Up to {humanPathwayAssetBytes(PATHWAY_ASSET_MAX_UPLOAD_BYTES)} each. Multipart Blob transfer is used automatically.</small></div>
      <div><button type="button" className="button primary" onClick={() => inputRef.current?.click()}>Choose files</button><input ref={inputRef} hidden multiple type="file" accept={ACCEPT} onChange={(event) => { void addFiles(Array.from(event.target.files ?? [])); event.currentTarget.value = ""; }}/></div>
    </section>

    <section className="pathway-ingest-stats">
      <article><span>Queue</span><strong>{totals.files}</strong><small>files</small></article>
      <article><span>Payload</span><strong>{humanPathwayAssetBytes(totals.bytes)}</strong><small>selected</small></article>
      <article><span>Active</span><strong>{totals.active}</strong><small>transfers</small></article>
      <article><span>Registered</span><strong>{totals.complete}</strong><small>masters</small></article>
    </section>

    {message ? <div className="notice pathway-ingest-notice"><CircleAlert size={16}/>{message}<button type="button" onClick={() => setMessage("")}><X size={14}/></button></div> : null}

    <section className="admin-card pathway-ingest-queue-card">
      <div className="pathway-ingest-section-head"><div><span className="section-kicker">Transfer queue</span><h2>Direct Blob uploads</h2></div><button type="button" className="button primary" disabled={runningAll || !queue.some((item) => item.status === "ready" || item.status === "failed")} onClick={() => void runReady()}>{runningAll ? <Loader2 size={15} className="spin"/> : <Sparkles size={15}/>} Upload ready</button></div>
      <div className="pathway-ingest-queue">
        {queue.length === 0 ? <div className="empty-state"><UploadCloud size={25}/><strong>No source files queued.</strong><span>Drop media above to start.</span></div> : queue.map((item) => {
          const kind = pathwayAssetMediaKind(item.file.type);
          const active = ["preparing", "uploading", "finalizing"].includes(item.status);
          return <article className={`pathway-ingest-row is-${item.status}`} key={item.id}>
            <div className="pathway-ingest-file-icon">{iconFor(item.file.type)}</div>
            <div className="pathway-ingest-file-main">
              <div className="pathway-ingest-file-head"><div><strong>{item.file.name}</strong><span>{pathwayAssetDisplayKind(item.file.type)} · {humanPathwayAssetBytes(item.file.size)}{item.actualStudio ? ` · ${item.actualStudio === "video" ? "Video Production" : "Carousel + Social"}` : ""}</span></div><b>{Math.round(item.progress * 100)}%</b></div>
              <div className="pathway-ingest-progress"><i style={{ width: `${Math.max(0, Math.min(item.progress * 100, 100))}%` }}/></div>
              <div className="pathway-ingest-file-foot">
                <span className={`status is-${item.status}`}>{item.status}</span>
                {item.speed > 0 && item.status === "uploading" ? <span><Gauge size={12}/>{humanPathwayAssetBytes(item.speed)}/s</span> : null}
                {item.eta > 0 && item.status === "uploading" ? <span><Clock3 size={12}/>{Math.ceil(item.eta)}s left</span> : null}
                {item.meta?.duration ? <span>{humanPathwayAssetDuration(item.meta.duration)}</span> : null}
                {item.meta?.width && item.meta?.height ? <span>{item.meta.width}×{item.meta.height}</span> : null}
                {item.duplicateTitle ? <span className="duplicate">Exact hash already exists: {item.duplicateTitle}</span> : null}
                {item.error ? <span className="error">{item.error}</span> : null}
                {kind === "video" || kind === "audio" ? <span>Auto-routed to Video Production</span> : null}
              </div>
            </div>
            <div className="pathway-ingest-row-actions">
              {(item.status === "ready" || item.status === "failed") ? <button type="button" title={item.status === "failed" ? "Retry upload" : "Upload"} onClick={() => void startUpload(item.id)}>{item.status === "failed" ? <RotateCcw size={15}/> : <UploadCloud size={15}/>}</button> : null}
              {active ? <button type="button" className="danger" title="Cancel transfer" onClick={() => void cancelItem(item.id)}><X size={15}/></button> : null}
              {item.status === "complete" && item.assetId ? <Link title="Open registered asset" href={`/admin/pathway-assets/${item.assetId}`}><Check size={15}/></Link> : null}
              {!active ? <button type="button" className="danger" title="Remove from queue" onClick={() => removeItem(item.id)}><Trash2 size={15}/></button> : null}
            </div>
          </article>;
        })}
      </div>
    </section>

    <section className="admin-card pathway-ingest-recovery">
      <div className="pathway-ingest-section-head"><div><span className="section-kicker">Transfer ledger</span><h2>Recent unfinished sessions</h2></div><button type="button" className="button" onClick={() => void refreshRecovery()}><RotateCcw size={14}/> Refresh</button></div>
      <p>Vercel Blob multipart uploads retry failed parts during the active transfer. If the browser closes, the server ledger preserves what happened so stale uploads can be cleaned safely; reselect the original file to start a fresh transfer.</p>
      <div>{recovery.length === 0 ? <span className="muted">No unfinished sessions for this Pathway.</span> : recovery.map((session) => <article key={session.id}><div>{iconFor(session.mime_type)}<span><strong>{session.file_name}</strong><small>{session.status} · {humanPathwayAssetBytes(Number(session.bytes_uploaded || 0))} / {humanPathwayAssetBytes(Number(session.file_size || 0))}</small></span></div><b>{new Date(session.updated_at).toLocaleString()}</b></article>)}</div>
    </section>
  </main>;
}
