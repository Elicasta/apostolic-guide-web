"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import {
  Camera,
  Check,
  Film,
  Link2,
  Loader2,
  Lock,
  LockOpen,
  Mic2,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  WandSparkles
} from "lucide-react";
import type { VideoProducerCameraDecision, VideoProducerCameraPlan, VideoProducerMediaAsset } from "@/video-producer-multicam";
import styles from "./video-producer-sequential.module.css";

const MULTIPART_THRESHOLD_BYTES = 100 * 1024 * 1024;

type MediaAsset = VideoProducerMediaAsset & { previewUrl?: string | null };
type MediaResponse = {
  rootProjectId: string;
  project: {
    id: string;
    parent_project_id?: string | null;
    camera_plan?: VideoProducerCameraPlan | null;
    audio_plan?: { version: 1; source: "camera_a" } | { version: 1; source: "external_audio"; assetId: string; offsetSeconds: number; syncRevision: number };
    source_range_start?: number | null;
    source_range_end?: number | null;
  };
  assets: MediaAsset[];
};
type DetailResponse = {
  project: { id: string; title: string; mode: "podcast" | "reels"; source_duration?: number | null; source_range_start?: number | null; source_range_end?: number | null };
  sourcePreviewUrl: string | null;
};

type Props = { projectId: string; mode: "source" | "produce" };

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(-140) || "media";
}
function formatOffset(value?: number | null) {
  const number = Number(value || 0);
  return `${number >= 0 ? "+" : ""}${number.toFixed(3)}s`;
}
function formatTime(value: number) {
  const safe = Math.max(0, value);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${seconds.toFixed(1).padStart(4, "0")}`;
}
function syncLabel(asset?: MediaAsset | null) {
  if (!asset) return "Not added";
  const labels: Record<string, string> = {
    uploading: "Uploading", analyzing: "Ready to sync", syncing: "Waveform syncing",
    synced: "Synced", needs_review: "Needs review", failed: "Sync failed", manual: "Manual sync"
  };
  return labels[asset.sync_status] || asset.sync_status;
}
function syncReady(asset?: MediaAsset | null) {
  return Boolean(asset && ["synced", "manual"].includes(asset.sync_status) && asset.offset_seconds != null);
}

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store", headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data as T;
}

export function VideoProducerMulticamPanel({ projectId, mode }: Props) {
  const [media, setMedia] = useState<MediaResponse | null>(null);
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [draftDecisions, setDraftDecisions] = useState<VideoProducerCameraDecision[]>([]);

  const load = useCallback(async () => {
    try {
      const [mediaData, detailData] = await Promise.all([
        json<MediaResponse>(`/api/admin/video-producer/media?projectId=${encodeURIComponent(projectId)}`),
        json<DetailResponse>(`/api/admin/video-producer/projects/${projectId}`)
      ]);
      setMedia(mediaData);
      setDetail(detailData);
      setDraftDecisions(mediaData.project.camera_plan?.decisions ?? []);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Studio 2.0 media could not be loaded.");
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!media?.assets.some((asset) => ["uploading", "analyzing", "syncing"].includes(asset.sync_status))) return;
    const timer = window.setInterval(() => void load(), 3500);
    return () => window.clearInterval(timer);
  }, [load, media?.assets]);

  const cameraB = media?.assets.find((asset) => asset.role === "camera_b") ?? null;
  const external = media?.assets.find((asset) => asset.role === "external_audio") ?? null;
  const externalIsMaster = media?.project.audio_plan?.source === "external_audio";
  const duration = useMemo(() => {
    const start = Number(detail?.project.source_range_start || 0);
    const end = detail?.project.source_range_end;
    return end != null ? Math.max(0, Number(end) - start) : Number(detail?.project.source_duration || 0);
  }, [detail]);

  async function uploadOptional(role: "camera_b" | "external_audio", file?: File) {
    if (!file || !media) return;
    const targetProjectId = media.rootProjectId;
    const assetId = crypto.randomUUID();
    const contentType = file.type || (role === "camera_b" ? (file.name.toLowerCase().endsWith(".mov") ? "video/quicktime" : "video/mp4") : "audio/wav");
    setBusy(`upload:${role}`); setError(""); setMessage(`Uploading ${role === "camera_b" ? "Camera B" : "External Audio"}…`);
    setUploadProgress((current) => ({ ...current, [role]: 0 }));
    try {
      await upload(`video-producer/media/${targetProjectId}/${role}/${assetId}/${safeName(file.name)}`, file, {
        access: "private",
        handleUploadUrl: "/api/admin/video-producer/media/upload",
        multipart: file.size >= MULTIPART_THRESHOLD_BYTES,
        contentType,
        clientPayload: JSON.stringify({ projectId: targetProjectId, assetId, role, filename: file.name, contentType, size: file.size }),
        onUploadProgress(event) { setUploadProgress((current) => ({ ...current, [role]: Math.round(event.percentage) })); }
      });
      setMessage("Upload complete. Running waveform synchronization…");
      await json("/api/admin/video-producer/media/sync", { method: "POST", body: JSON.stringify({ projectId: targetProjectId, assetId }) });
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Optional media upload failed.");
    } finally { setBusy(null); }
  }

  async function syncAsset(asset: MediaAsset) {
    setBusy(`sync:${asset.id}`); setError(""); setMessage("Comparing the recorded waveforms…");
    try {
      await json("/api/admin/video-producer/media/sync", { method: "POST", body: JSON.stringify({ projectId, assetId: asset.id }) });
      await load();
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Waveform sync failed to start."); }
    finally { setBusy(null); }
  }

  async function saveOffset(asset: MediaAsset, offset: number) {
    setBusy(`offset:${asset.id}`); setError("");
    try {
      await json("/api/admin/video-producer/media", { method: "PATCH", body: JSON.stringify({ action: "offset", projectId, assetId: asset.id, offsetSeconds: offset }) });
      setMessage(`${asset.role === "camera_b" ? "Camera B" : "External Audio"} offset saved manually.`);
      await load();
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Offset could not be saved."); }
    finally { setBusy(null); }
  }

  async function chooseAudio(source: "camera_a" | "external_audio") {
    setBusy("audio"); setError("");
    try {
      await json("/api/admin/video-producer/media", {
        method: "PATCH",
        body: JSON.stringify({ action: "audio", projectId, source, assetId: source === "external_audio" ? external?.id : undefined })
      });
      setMessage(source === "external_audio" ? "External Audio is now the continuous master voice source." : "Camera A audio restored as master.");
      await load();
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Master audio could not be changed."); }
    finally { setBusy(null); }
  }

  async function autoCut() {
    setBusy("autocut"); setError(""); setMessage("Sol Camera Director is building intentional A/B decisions…");
    try {
      const data = await json<{ cameraPlan: VideoProducerCameraPlan; summary?: string }>("/api/admin/video-producer/auto-cut", { method: "POST", body: JSON.stringify({ projectId }) });
      setDraftDecisions(data.cameraPlan.decisions);
      setMessage(data.summary ? `Camera plan ready: ${data.summary}` : "Smart Auto Cut ready.");
      await load();
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Smart Auto Cut failed."); }
    finally { setBusy(null); }
  }

  async function saveCameraPlan() {
    setBusy("save-camera"); setError("");
    try {
      const data = await json<{ cameraPlan: VideoProducerCameraPlan }>("/api/admin/video-producer/camera-plan", {
        method: "PATCH", body: JSON.stringify({ projectId, decisions: draftDecisions })
      });
      setDraftDecisions(data.cameraPlan.decisions);
      setMessage("Camera decisions saved. Final approval will fingerprint this exact A/B plan.");
      await load();
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Camera Plan could not be saved."); }
    finally { setBusy(null); }
  }

  function updateDecision(index: number, patch: Partial<VideoProducerCameraDecision>) {
    setDraftDecisions((current) => current.map((decision, itemIndex) => itemIndex === index ? { ...decision, ...patch, source: "manual" } : decision));
  }

  if (!media || !detail) return <div style={{ maxWidth: 1180, margin: "0 auto 24px", padding: "0 18px" }}><div className={styles.notice}>{error || "Loading Studio 2.0 media…"}</div></div>;

  if (mode === "source") {
    return (
      <section style={{ maxWidth: 1180, margin: "-6px auto 28px", padding: "0 18px" }}>
        <div className={styles.panel}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div><div style={{ color: "#ef6575", fontSize: 10, fontWeight: 900, letterSpacing: ".18em", marginBottom: 7 }}>STUDIO 2.0 · OPTIONAL</div><h3 className={styles.panelTitle}><Link2 size={17}/> Synchronized media</h3><p className={styles.panelText}>Camera A remains the master timeline. Add a second angle and/or separately recorded microphone audio only when you have them.</p></div>
            <button type="button" className={styles.buttonSecondary} disabled={Boolean(busy)} onClick={() => void load()}><RefreshCw size={14}/> Refresh</button>
          </div>
          {error ? <div className={`${styles.notice} ${styles.warning}`} style={{ marginTop: 12 }}>{error}</div> : null}
          {message ? <div className={styles.notice} style={{ marginTop: 12 }}>{message}</div> : null}
          <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
            <MediaRow icon={<Film size={17}/>} title="Camera A" subtitle="MASTER · project time 0.00s" status="Synced" tone="good"/>
            <MediaAssetRow
              icon={<Camera size={17}/>} title="Camera B" asset={cameraB} role="camera_b" busy={busy} uploadPercent={uploadProgress.camera_b || 0}
              onUpload={(file) => void uploadOptional("camera_b", file)} onSync={() => cameraB && void syncAsset(cameraB)} onOffset={(offset) => cameraB && void saveOffset(cameraB, offset)}
            />
            <MediaAssetRow
              icon={<Mic2 size={17}/>} title="External Audio" asset={external} role="external_audio" busy={busy} uploadPercent={uploadProgress.external_audio || 0}
              onUpload={(file) => void uploadOptional("external_audio", file)} onSync={() => external && void syncAsset(external)} onOffset={(offset) => external && void saveOffset(external, offset)}
            />
          </div>
          {external ? <div style={{ marginTop: 15, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}><span style={{ fontSize: 11, color: "#80919d", fontWeight: 800 }}>MASTER AUDIO</span><button type="button" className={externalIsMaster ? styles.buttonSecondary : styles.button} disabled={Boolean(busy)} onClick={() => void chooseAudio("camera_a")}>Camera A</button><button type="button" className={externalIsMaster ? styles.button : styles.buttonSecondary} disabled={Boolean(busy) || !syncReady(external)} onClick={() => void chooseAudio("external_audio")}>External Audio</button></div> : null}
        </div>
      </section>
    );
  }

  if (!cameraB) return null;
  return (
    <section style={{ maxWidth: 1180, margin: "-6px auto 28px", padding: "0 18px" }}>
      <div className={styles.panel}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div><div style={{ color: "#ef6575", fontSize: 10, fontWeight: 900, letterSpacing: ".18em", marginBottom: 7 }}>STUDIO 2.0 · CAMERA DIRECTOR</div><h3 className={styles.panelTitle}><Camera size={17}/> Multicam edit</h3><p className={styles.panelText}>Camera A is the authority angle. Camera B becomes intentional punctuation on the same source-time timeline.</p></div>
          <button type="button" className={styles.button} disabled={Boolean(busy) || !syncReady(cameraB)} onClick={() => void autoCut()}>{busy === "autocut" ? <Loader2 size={14}/> : <WandSparkles size={14}/>} {media.project.camera_plan ? "Regenerate Auto Cut" : "Smart Auto Cut"}</button>
        </div>
        {error ? <div className={`${styles.notice} ${styles.warning}`} style={{ marginTop: 12 }}>{error}</div> : null}
        {message ? <div className={styles.notice} style={{ marginTop: 12 }}>{message}</div> : null}
        {!syncReady(cameraB) ? <div className={`${styles.notice} ${styles.warning}`} style={{ marginTop: 14 }}>Camera B must be synchronized on Source before Auto Cut or multicam preview can run.</div> : <>
          <SynchronizedPreview detail={detail} media={media} cameraB={cameraB} external={external} decisions={draftDecisions}/>
          <div style={{ display: "grid", gap: 8, marginTop: 16 }}>
            {draftDecisions.length ? draftDecisions.map((decision, index) => (
              <div key={decision.id} style={{ display: "grid", gridTemplateColumns: "minmax(90px, .7fr) minmax(70px, .5fr) minmax(0, 1.5fr) auto auto", gap: 8, alignItems: "center", padding: 10, border: "1px solid rgba(169,191,206,.12)", borderRadius: 12 }}>
                <input className={styles.input} type="number" min="0" max={duration || undefined} step="0.1" value={Number(decision.at.toFixed(2))} onChange={(event) => updateDecision(index, { at: Number(event.target.value) })}/>
                <select className={styles.select} value={decision.camera} onChange={(event) => updateDecision(index, { camera: event.target.value === "B" ? "B" : "A" })}><option value="A">Camera A</option><option value="B">Camera B</option></select>
                <input className={styles.input} value={decision.reason || ""} placeholder="Reason / note" onChange={(event) => updateDecision(index, { reason: event.target.value })}/>
                <button type="button" className={styles.buttonSecondary} title={decision.locked ? "Unlock decision" : "Lock decision"} onClick={() => updateDecision(index, { locked: !decision.locked })}>{decision.locked ? <Lock size={14}/> : <LockOpen size={14}/>}</button>
                <button type="button" className={styles.buttonSecondary} title="Delete switch" onClick={() => setDraftDecisions((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={14}/></button>
              </div>
            )) : <div className={styles.notice} style={{ marginTop: 4 }}>No A/B switches yet. Camera A remains active for the entire episode until you run Smart Auto Cut or add a switch.</div>}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
            <button type="button" className={styles.buttonSecondary} onClick={() => setDraftDecisions((current) => [...current, { id: crypto.randomUUID(), at: Math.min(duration - .1, Math.max(.1, duration / 2)), camera: "B", source: "manual", locked: true, reason: "Manual switch" }])}><Plus size={14}/> Add switch</button>
            <button type="button" className={styles.button} disabled={Boolean(busy)} onClick={() => void saveCameraPlan()}><Save size={14}/> Save Camera Plan</button>
          </div>
        </>}
      </div>
    </section>
  );
}

function MediaRow({ icon, title, subtitle, status, tone }: { icon: React.ReactNode; title: string; subtitle: string; status: string; tone?: "good" }) {
  return <div style={{ display: "grid", gridTemplateColumns: "38px minmax(0,1fr) auto", gap: 11, alignItems: "center", padding: 12, border: "1px solid rgba(169,191,206,.12)", borderRadius: 13 }}><div style={{ width: 38, height: 38, borderRadius: 11, display: "grid", placeItems: "center", background: "rgba(255,255,255,.04)", color: "#8aa9e8" }}>{icon}</div><div><strong style={{ display: "block", fontSize: 13 }}>{title}</strong><small style={{ color: "#718692" }}>{subtitle}</small></div><span style={{ fontSize: 9, fontWeight: 900, letterSpacing: ".08em", color: tone === "good" ? "#65d9a5" : "#9aadb8" }}>{status.toUpperCase()}</span></div>;
}

function MediaAssetRow({ icon, title, asset, role, busy, uploadPercent, onUpload, onSync, onOffset }: {
  icon: React.ReactNode; title: string; asset: MediaAsset | null; role: "camera_b" | "external_audio"; busy: string | null; uploadPercent: number;
  onUpload: (file: File) => void; onSync: () => void; onOffset: (offset: number) => void;
}) {
  const [offset, setOffset] = useState(Number(asset?.offset_seconds || 0));
  useEffect(() => { setOffset(Number(asset?.offset_seconds || 0)); }, [asset?.offset_seconds]);
  const syncing = asset?.sync_status === "syncing";
  const progress = Number(((asset?.sync_metadata as Record<string, unknown> | null)?.syncBridge as Record<string, unknown> | undefined)?.progress || 0);
  return <div style={{ padding: 12, border: "1px solid rgba(169,191,206,.12)", borderRadius: 13 }}>
    <div style={{ display: "grid", gridTemplateColumns: "38px minmax(0,1fr) auto", gap: 11, alignItems: "center" }}><div style={{ width: 38, height: 38, borderRadius: 11, display: "grid", placeItems: "center", background: "rgba(255,255,255,.04)", color: "#8aa9e8" }}>{icon}</div><div><strong style={{ display: "block", fontSize: 13 }}>{title}</strong><small style={{ color: "#718692" }}>{asset ? `${asset.filename} · ${formatOffset(asset.offset_seconds)}` : "Optional"}</small></div><span style={{ fontSize: 9, fontWeight: 900, letterSpacing: ".08em", color: syncReady(asset) ? "#65d9a5" : asset?.sync_status === "failed" ? "#ff8a97" : "#9aadb8" }}>{syncLabel(asset).toUpperCase()}</span></div>
    {syncing ? <div style={{ marginTop: 10 }}><div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#8597a3" }}><span>Waveform analysis</span><strong>{progress}%</strong></div><div style={{ height: 4, background: "rgba(255,255,255,.07)", borderRadius: 99, marginTop: 6 }}><div style={{ width: `${Math.max(3, progress)}%`, height: "100%", background: "#75a1ff", borderRadius: 99 }}/></div></div> : null}
    {busy === `upload:${role}` ? <div style={{ marginTop: 10, fontSize: 10, color: "#8fa1ad" }}>Uploading · {uploadPercent}%</div> : null}
    <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 10 }}>
      <label className={styles.buttonSecondary} style={{ cursor: busy ? "wait" : "pointer" }}>{asset ? "Replace" : "Add"}<input hidden type="file" disabled={Boolean(busy)} accept={role === "camera_b" ? "video/*" : "audio/*,.wav,.mp3,.m4a,.aac,.flac,.ogg"} onChange={(event) => { const file = event.target.files?.[0]; if (file) onUpload(file); event.currentTarget.value = ""; }}/></label>
      {asset && ["analyzing", "failed", "needs_review", "manual", "synced"].includes(asset.sync_status) ? <button type="button" className={styles.buttonSecondary} disabled={Boolean(busy)} onClick={onSync}><Sparkles size={13}/> {syncReady(asset) ? "Re-sync" : "Sync"}</button> : null}
      {asset && asset.offset_seconds != null ? <><input className={styles.input} style={{ width: 112 }} type="number" step="0.01" value={offset} onChange={(event) => setOffset(Number(event.target.value))}/><button type="button" className={styles.buttonSecondary} disabled={Boolean(busy)} onClick={() => onOffset(offset)}>Save offset</button></> : null}
    </div>
  </div>;
}

function SynchronizedPreview({ detail, media, cameraB, external, decisions }: { detail: DetailResponse; media: MediaResponse; cameraB: MediaAsset; external: MediaAsset | null; decisions: VideoProducerCameraDecision[] }) {
  const aRef = useRef<HTMLVideoElement | null>(null);
  const bRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [camera, setCamera] = useState<"A" | "B">("A");
  const start = Number(detail.project.source_range_start || 0);
  const end = detail.project.source_range_end != null ? Number(detail.project.source_range_end) : null;
  const externalMaster = media.project.audio_plan?.source === "external_audio" && external && syncReady(external);
  const sorted = useMemo(() => [...decisions].sort((left, right) => left.at - right.at), [decisions]);

  function currentCamera(localTime: number) {
    let next: "A" | "B" = "A";
    for (const decision of sorted) {
      if (decision.at > localTime) break;
      next = decision.camera;
    }
    return next;
  }
  function synchronize() {
    const a = aRef.current;
    if (!a) return;
    if (end != null && a.currentTime > end) { a.pause(); a.currentTime = start; }
    const global = a.currentTime;
    const local = Math.max(0, global - start);
    setCamera(currentCamera(local));
    const b = bRef.current;
    if (b && cameraB.offset_seconds != null) {
      const target = global - Number(cameraB.offset_seconds);
      if (target >= 0 && target <= Number(cameraB.duration || Infinity) && Math.abs(b.currentTime - target) > .16) b.currentTime = target;
    }
    const audio = audioRef.current;
    if (audio && external?.offset_seconds != null) {
      const target = global - Number(external.offset_seconds);
      if (target >= 0 && target <= Number(external.duration || Infinity) && Math.abs(audio.currentTime - target) > .12) audio.currentTime = target;
    }
  }
  async function playFollowers() {
    synchronize();
    try { await bRef.current?.play(); } catch { /* muted preview follower may be blocked; seek sync still works */ }
    if (externalMaster) try { await audioRef.current?.play(); } catch { /* user can still evaluate picture switching */ }
  }
  function pauseFollowers() { bRef.current?.pause(); audioRef.current?.pause(); }

  return <div style={{ marginTop: 16 }}>
    <div style={{ position: "relative", borderRadius: 15, overflow: "hidden", background: "#000", aspectRatio: detail.project.mode === "reels" ? "9 / 16" : "16 / 9", maxHeight: detail.project.mode === "reels" ? 620 : undefined }}>
      {detail.sourcePreviewUrl ? <video ref={aRef} src={detail.sourcePreviewUrl} controls preload="metadata" muted={Boolean(externalMaster)} onLoadedMetadata={(event) => { if (start > 0) event.currentTarget.currentTime = start; }} onTimeUpdate={synchronize} onSeeking={synchronize} onPlay={() => void playFollowers()} onPause={pauseFollowers} style={{ width: "100%", height: "100%", objectFit: "contain", display: camera === "A" ? "block" : "none" }}/> : null}
      {cameraB.previewUrl ? <video ref={bRef} src={cameraB.previewUrl} muted playsInline preload="metadata" style={{ width: "100%", height: "100%", objectFit: "contain", display: camera === "B" ? "block" : "none", pointerEvents: "none" }}/> : null}
      {externalMaster && external?.previewUrl ? <audio ref={audioRef} src={external.previewUrl} preload="metadata"/> : null}
      <div style={{ position: "absolute", top: 10, left: 10, padding: "5px 8px", borderRadius: 8, background: "rgba(3,8,14,.78)", color: "white", fontSize: 10, fontWeight: 900, letterSpacing: ".08em", pointerEvents: "none" }}>CAMERA {camera}</div>
    </div>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 7, color: "#718692", fontSize: 10 }}><span>Preview follows the Camera Plan; both originals remain untouched.</span><span>{externalMaster ? "EXT AUDIO" : "CAM A AUDIO"}</span></div>
  </div>;
}
