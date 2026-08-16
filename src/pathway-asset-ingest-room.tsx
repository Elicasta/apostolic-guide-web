"use client";

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
  Pause,
  Play,
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
  PATHWAY_ASSET_TUS_CHUNK_BYTES,
  pathwayAssetClientFingerprint,
  pathwayAssetDisplayKind,
  pathwayAssetIngestStudio,
  pathwayAssetMediaKind,
  type PathwayAssetIngestStudio
} from "@/pathway-asset-ingest";

type PathwayOption = { slug: string; title: string; summary: string; collection: string };
type QueueStatus = "ready" | "preparing" | "uploading" | "paused" | "finalizing" | "complete" | "failed" | "cancelled";
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
  tusUrl?: string;
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
  "video/mp4", "video/quicktime", "video/webm",
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

function utf8Base64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function tusMetadata(values: Record<string, string>) {
  return Object.entries(values).map(([key, value]) => `${key} ${utf8Base64(value)}`).join(",");
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
        resolve({ duration: media.duration, width: kind === "video" ? video.videoWidth : undefined, height: kind === "video" ? video.videoHeight : undefined });
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
      if (file.size > PATHWAY_ASSET_MAX_UPLOAD_BYTES) { rejected.push(`${file.name}: over 1 GB`); continue; }
      if (queueRef.current.some((item) => item.file.name === file.name && item.file.size === file.size && item.file.lastModified === file.lastModified && item.status !== "cancelled")) continue;
      accepted.push({ id: crypto.randomUUID(), file, status: "ready", progress: 0, bytesUploaded: 0, speed: 0, eta: 0 });
    }
    if (accepted.length) {
      setQueue((current) => [...current, ...accepted]);
      void Promise.all(accepted.map(async (item) => patchItem(item.id, { meta: await inspectFile(item.file) })));
    }
    if (rejected.length) setMessage(rejected.join(" · "));
  }

  async function ensureTusUpload(item: QueueItem, prepared: Record<string, any>) {
    const signature = String(prepared.signature || "");
    const endpoint = String(prepared.endpoint || "");
    const session = prepared.session as Record<string, any>;
    let tusUrl = String(session.tus_url || item.tusUrl || "");
    let offset = 0;

    if (tusUrl) {
      const head = await fetch(tusUrl, { method: "HEAD", headers: { "Tus-Resumable": "1.0.0", "x-signature": signature } });
      if (head.ok) offset = Number(head.headers.get("Upload-Offset") || 0);
      else tusUrl = "";
    }

    if (!tusUrl) {
      const created = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Tus-Resumable": "1.0.0",
          "Upload-Length": String(item.file.size),
          "Upload-Metadata": tusMetadata({
            bucketName: String(session.storage_bucket),
            objectName: String(session.storage_path),
            contentType: item.file.type,
            cacheControl: "31536000",
            metadata: JSON.stringify({ pathwaySlug, ingestSessionId: session.id })
          }),
          "x-signature": signature,
          "x-upsert": "false"
        }
      });
      if (!created.ok) throw new Error(`Could not start resumable transfer (${created.status}).`);
      tusUrl = created.headers.get("Location") || "";
      if (!tusUrl) throw new Error("Storage did not return a resumable upload URL.");
      await postAction({ action: "attach", sessionId: session.id, tusUrl });
    }

    return { tusUrl, offset, signature };
  }

  async function finalize(sessionId: string) {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try { return await postAction({ action: "finalize", sessionId }); }
      catch (error) {
        lastError = error instanceof Error ? error : new Error("Finalization failed.");
        await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
      }
    }
    throw lastError || new Error("Finalization failed.");
  }

  async function startUpload(id: string) {
    const item = queueRef.current.find((entry) => entry.id === id);
    if (!item || ["uploading", "preparing", "finalizing", "complete", "cancelled"].includes(item.status)) return;
    patchItem(id, { status: "preparing", error: undefined });
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
      const session = prepared.session as Record<string, any>;
      const duplicateTitle = prepared.duplicateAsset?.title ? String(prepared.duplicateAsset.title) : undefined;
      const auth = await ensureTusUpload(item, prepared);
      patchItem(id, { sessionId: String(session.id), tusUrl: auth.tusUrl, actualStudio: session.studio, duplicateTitle, meta, status: "uploading", bytesUploaded: auth.offset, progress: item.file.size ? auth.offset / item.file.size : 0 });
      let offset = auth.offset;
      let lastServerUpdate = offset;

      while (offset < item.file.size) {
        const controller = new AbortController();
        controllers.current.set(id, controller);
        const chunk = item.file.slice(offset, Math.min(offset + PATHWAY_ASSET_TUS_CHUNK_BYTES, item.file.size));
        const response = await fetch(auth.tusUrl, {
          method: "PATCH",
          headers: {
            "Tus-Resumable": "1.0.0",
            "Upload-Offset": String(offset),
            "Content-Type": "application/offset+octet-stream",
            "x-signature": auth.signature
          },
          body: chunk,
          signal: controller.signal
        });
        if (!response.ok) throw new Error(`Transfer interrupted (${response.status}). Press Resume to continue.`);
        offset = Number(response.headers.get("Upload-Offset") || (offset + chunk.size));
        const elapsed = Math.max((performance.now() - startedAt) / 1000, .1);
        const speed = Math.max((offset - auth.offset) / elapsed, 0);
        const remaining = Math.max(item.file.size - offset, 0);
        patchItem(id, { status: "uploading", bytesUploaded: offset, progress: offset / item.file.size, speed, eta: speed > 0 ? remaining / speed : 0 });
        if (offset - lastServerUpdate >= PATHWAY_ASSET_TUS_CHUNK_BYTES * 4 || offset === item.file.size) {
          lastServerUpdate = offset;
          void postAction({ action: "progress", sessionId: session.id, bytesUploaded: offset }).catch(() => undefined);
        }
      }

      controllers.current.delete(id);
      patchItem(id, { status: "finalizing", progress: 1, bytesUploaded: item.file.size, eta: 0 });
      const result = await finalize(String(session.id));
      patchItem(id, { status: "complete", assetId: String(result.assetId || result.asset?.id || ""), progress: 1, bytesUploaded: item.file.size, speed: 0, eta: 0 });
      void refreshRecovery();
    } catch (error) {
      controllers.current.delete(id);
      if (error instanceof DOMException && error.name === "AbortError") return;
      const current = queueRef.current.find((entry) => entry.id === id);
      const text = error instanceof Error ? error.message : "Upload failed.";
      patchItem(id, { status: "failed", error: text, speed: 0, eta: 0 });
      if (current?.sessionId) void postAction({ action: "fail", sessionId: current.sessionId, bytesUploaded: current.bytesUploaded, error: text }).catch(() => undefined);
    }
  }

  async function pauseUpload(item: QueueItem) {
    controllers.current.get(item.id)?.abort();
    controllers.current.delete(item.id);
    patchItem(item.id, { status: "paused", speed: 0, eta: 0 });
    if (item.sessionId) await postAction({ action: "pause", sessionId: item.sessionId, bytesUploaded: item.bytesUploaded }).catch(() => undefined);
  }

  async function cancelUpload(item: QueueItem) {
    controllers.current.get(item.id)?.abort();
    controllers.current.delete(item.id);
    if (item.sessionId) await postAction({ action: "cancel", sessionId: item.sessionId }).catch(() => undefined);
    patchItem(item.id, { status: "cancelled", speed: 0, eta: 0 });
    void refreshRecovery();
  }

  async function startAll() {
    const pending = queueRef.current.filter((item) => ["ready", "paused", "failed"].includes(item.status)).map((item) => item.id);
    if (!pending.length) return;
    setRunningAll(true);
    let cursor = 0;
    const worker = async () => {
      while (cursor < pending.length) {
        const id = pending[cursor++];
        await startUpload(id);
      }
    };
    await Promise.all([worker(), worker()]);
    setRunningAll(false);
  }

  if (!pathway) return null;

  return <main className="admin-page pathway-ingest-room">
    <div className="pathway-ingest-topline">
      <Link href="/admin/assets" className="button"><ArrowLeft size={15}/> Asset Library</Link>
      <span><ShieldCheck size={14}/> Private source storage · resumable TUS · 6 MB chunks</span>
    </div>

    <header className="pathway-ingest-hero">
      <div>
        <span className="section-kicker">Pathway Assets · Ingest Dock</span>
        <h1>Drop the master files.<br/><em>The Studio takes it from here.</em></h1>
        <p>Large video, audio, images, reference PDFs, and project archives go straight into the Pathway source of truth. Transfers resume instead of restarting, every file is traced, and final assets land back in the library ready for production.</p>
      </div>
      <div className="pathway-ingest-hero-orbit" aria-hidden="true"><UploadCloud size={34}/><span>1 GB</span><small>per source</small></div>
    </header>

    <section className="pathway-ingest-controls admin-card">
      <label><span>Pathway</span><select value={pathwaySlug} onChange={(event) => setPathwaySlug(event.target.value)}>{pathways.map((item) => <option value={item.slug} key={item.slug}>{item.title}</option>)}</select></label>
      <div><span>Default destination</span><div className="pathway-ingest-lanes"><button type="button" className={studio === "carousel" ? "is-active" : ""} onClick={() => setStudio("carousel")}><ImageIcon size={15}/> Carousel + Social</button><button type="button" className={studio === "video" ? "is-active" : ""} onClick={() => setStudio("video")}><Film size={15}/> Video Production</button></div></div>
      <p><strong>{pathway.title}</strong><span>{pathway.summary}</span></p>
    </section>

    <section
      className={`pathway-ingest-drop ${dragging ? "is-dragging" : ""}`}
      onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => { event.preventDefault(); if (event.currentTarget === event.target) setDragging(false); }}
      onDrop={(event) => { event.preventDefault(); setDragging(false); void addFiles(Array.from(event.dataTransfer.files)); }}
    >
      <input ref={inputRef} type="file" hidden multiple accept={ACCEPT} onChange={(event) => { void addFiles(Array.from(event.target.files || [])); event.target.value = ""; }}/>
      <div className="pathway-ingest-drop-icon"><UploadCloud size={30}/></div>
      <div><strong>Drop masters here</strong><p>MP4, MOV, WebM, WAV, MP3, PNG, JPG, WebP, PDF, ZIP · up to 1 GB each</p><small>Video and audio automatically route to Video Production. Images and references honor the selected lane.</small></div>
      <button type="button" className="button primary" onClick={() => inputRef.current?.click()}>Choose files</button>
    </section>

    <section className="pathway-ingest-stats">
      <article><span>Queue</span><strong>{totals.files}</strong><small>{humanPathwayAssetBytes(totals.bytes)}</small></article>
      <article><span>Active</span><strong>{totals.active}</strong><small>2 concurrent max</small></article>
      <article><span>Filed</span><strong>{totals.complete}</strong><small>library assets</small></article>
      <article><span>Recovery</span><strong>{recovery.length}</strong><small>24-hour sessions</small></article>
    </section>

    {message ? <div className="admin-notice pathway-ingest-notice"><CircleAlert size={16}/><span>{message}</span><button type="button" onClick={() => setMessage("")}><X size={14}/></button></div> : null}

    <section className="admin-card pathway-ingest-queue-card">
      <div className="pathway-ingest-section-head"><div><span className="section-kicker">Transfer queue</span><h2>Source masters</h2></div><button type="button" className="button primary" disabled={runningAll || !queue.some((item) => ["ready", "paused", "failed"].includes(item.status))} onClick={() => void startAll()}>{runningAll ? <Loader2 className="spin" size={15}/> : <Play size={15}/>} Start queue</button></div>
      {queue.length ? <div className="pathway-ingest-queue">{queue.map((item) => {
        const kind = pathwayAssetDisplayKind(item.file.type);
        const routedStudio = item.actualStudio || pathwayAssetIngestStudio(item.file.type, studio);
        return <article className={`pathway-ingest-row is-${item.status}`} key={item.id}>
          <div className="pathway-ingest-file-icon">{item.status === "complete" ? <Check size={20}/> : iconFor(item.file.type)}</div>
          <div className="pathway-ingest-file-main">
            <div className="pathway-ingest-file-head"><div><strong>{item.file.name}</strong><span>{kind} · {humanPathwayAssetBytes(item.file.size)} · {routedStudio === "video" ? "Video Production" : "Carousel + Social"}{item.meta?.duration ? ` · ${humanPathwayAssetDuration(item.meta.duration)}` : ""}{item.meta?.width && item.meta?.height ? ` · ${item.meta.width}×${item.meta.height}` : ""}</span></div><b>{Math.round(item.progress * 100)}%</b></div>
            <div className="pathway-ingest-progress"><i style={{ width: `${Math.max(0, Math.min(item.progress * 100, 100))}%` }}/></div>
            <div className="pathway-ingest-file-foot"><span className={`status is-${item.status}`}>{item.status}</span>{item.speed > 0 ? <span><Gauge size={12}/> {humanPathwayAssetBytes(item.speed)}/s</span> : null}{item.eta > 0 ? <span><Clock3 size={12}/> {humanPathwayAssetDuration(item.eta)} left</span> : null}{item.duplicateTitle ? <span className="duplicate"><CircleAlert size={12}/> same hash already exists: {item.duplicateTitle}</span> : null}{item.error ? <span className="error">{item.error}</span> : null}</div>
          </div>
          <div className="pathway-ingest-row-actions">
            {item.status === "uploading" ? <button type="button" title="Pause" onClick={() => void pauseUpload(item)}><Pause size={15}/></button> : null}
            {["ready", "paused", "failed"].includes(item.status) ? <button type="button" title={item.status === "ready" ? "Start" : "Resume"} onClick={() => void startUpload(item.id)}>{item.status === "failed" ? <RotateCcw size={15}/> : <Play size={15}/>}</button> : null}
            {!(["complete", "cancelled"].includes(item.status)) ? <button type="button" title="Cancel" className="danger" onClick={() => void cancelUpload(item)}><Trash2 size={15}/></button> : null}
            {item.status === "complete" && item.assetId ? <Link href={`/admin/pathway-assets/${item.assetId}`} title="Open asset"><Sparkles size={15}/></Link> : null}
          </div>
        </article>;
      })}</div> : <div className="studio-empty-state compact"><UploadCloud size={28}/><strong>Ingest dock is clear</strong><p>Add source masters above. Nothing is proxied through the Next.js server, so large transfers stay fast and recoverable.</p></div>}
    </section>

    {recovery.length ? <section className="admin-card pathway-ingest-recovery"><div className="pathway-ingest-section-head"><div><span className="section-kicker">Recovery bay</span><h2>Interrupted sessions</h2></div><button type="button" className="button" onClick={() => void refreshRecovery()}><RotateCcw size={14}/> Refresh</button></div><p>Reselect the same file in the drop zone and the Studio will find its session, HEAD the TUS upload, and continue from the last stored offset.</p><div>{recovery.map((session) => <article key={session.id}><div>{iconFor(session.mime_type)}<span><strong>{session.file_name}</strong><small>{session.status} · {humanPathwayAssetBytes(Number(session.bytes_uploaded || 0))} of {humanPathwayAssetBytes(Number(session.file_size || 0))}</small></span></div><b>{Math.round((Number(session.bytes_uploaded || 0) / Math.max(Number(session.file_size || 1), 1)) * 100)}%</b></article>)}</div></section> : null}
  </main>;
}
