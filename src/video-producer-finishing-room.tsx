"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { upload } from "@vercel/blob/client";
import {
  CheckCircle2,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  Music2,
  Send,
  SlidersHorizontal,
  Sparkles,
  Upload as UploadIcon
} from "lucide-react";
import styles from "./video-producer-finishing-room.module.css";

const LAST_PROJECT_KEY = "apostolic-guide:video-producer:last-project";
const WORKSPACE_SELECT = "main.min-h-screen header select";
const MULTIPART_THRESHOLD_BYTES = 100 * 1024 * 1024;

type PathwayOption = { slug: string; title: string; summary: string; steps: Array<{ title: string; reference: string }> };
type MusicTrack = {
  id: string; title: string; source_provider: string; source_url?: string | null; filename: string;
  size_bytes: number; duration_seconds?: number | null; mood?: string | null; previewUrl?: string | null;
};
type Thumbnail = {
  id: string; variant: "face-hook" | "doctrine" | "pathway"; headline: string; timestamp_seconds: number;
  status: string; previewUrl?: string | null; error?: string | null;
};
type FinishingData = {
  project: {
    id: string; title: string; mode: "podcast" | "reels"; status: string; pathway_slug?: string | null;
    selected_music_track_id?: string | null; publisher_render_id?: string | null; edit_plan?: unknown; approval_fingerprint?: string | null;
  };
  latestCompletedRender?: { id: string; status: string; output_storage_path?: string | null } | null;
  publisherRender?: { id: string; status: string; output_url?: string | null; error?: string | null } | null;
  publisherUrl: string;
  pathways: PathwayOption[];
  musicTracks: MusicTrack[];
  thumbnails: Thumbnail[];
};

function currentProjectId() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("project") || window.localStorage.getItem(LAST_PROJECT_KEY) || "";
}

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(-140) || "music.mp3";
}

function mb(value: number) {
  return `${Math.max(0, value || 0) / 1024 / 1024 < 10 ? (Math.max(0, value || 0) / 1024 / 1024).toFixed(1) : Math.round(Math.max(0, value || 0) / 1024 / 1024)} MB`;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store"
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data as T;
}

export function VideoProducerFinishingRoom() {
  const [projectId, setProjectId] = useState("");
  const [data, setData] = useState<FinishingData | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [musicTitle, setMusicTitle] = useState("");
  const [sunoUrl, setSunoUrl] = useState("");
  const [musicMood, setMusicMood] = useState("");
  const [musicFile, setMusicFile] = useState<File | null>(null);
  const [musicUploadProgress, setMusicUploadProgress] = useState(0);

  const syncProject = useCallback(() => setProjectId(currentProjectId()), []);
  useEffect(() => {
    syncProject();
    const onPopState = () => syncProject();
    const onChange = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLSelectElement) || !target.matches(WORKSPACE_SELECT)) return;
      window.setTimeout(syncProject, 0);
    };
    window.addEventListener("popstate", onPopState);
    document.addEventListener("change", onChange, true);
    const timer = window.setInterval(syncProject, 1800);
    return () => {
      window.removeEventListener("popstate", onPopState);
      document.removeEventListener("change", onChange, true);
      window.clearInterval(timer);
    };
  }, [syncProject]);

  const load = useCallback(async () => {
    if (!projectId) { setData(null); return; }
    try {
      const next = await requestJson<FinishingData>(`/api/admin/video-producer/finishing?projectId=${encodeURIComponent(projectId)}`);
      setData(next);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Finishing room could not be loaded.");
    }
  }, [projectId]);

  useEffect(() => {
    void load();
    if (!projectId) return;
    const timer = window.setInterval(() => { void load(); }, 5000);
    return () => window.clearInterval(timer);
  }, [load, projectId]);

  const project = data?.project;
  const selectedPathway = useMemo(() => data?.pathways.find((item) => item.slug === project?.pathway_slug) ?? null, [data?.pathways, project?.pathway_slug]);
  const publisherReady = data?.publisherRender?.status === "completed";
  const publisherWorking = data?.publisherRender?.status === "queued" || data?.publisherRender?.status === "rendering";
  const settingsLocked = Boolean(project && ["uploading", "transcribing", "directing", "rendering"].includes(project.status));

  async function patch(payload: { pathwaySlug?: string | null; musicTrackId?: string | null }) {
    if (!project) return;
    setBusy("settings"); setMessage(""); setError("");
    try {
      await requestJson("/api/admin/video-producer/finishing", { method: "PATCH", body: JSON.stringify({ projectId: project.id, ...payload }) });
      setMessage("Finishing settings saved. If an approved master existed, review/approval was intentionally reset so the new graphics or music cannot bypass you.");
      await load();
    } catch (patchError) {
      setError(patchError instanceof Error ? patchError.message : "Finishing settings could not be saved.");
    } finally { setBusy(null); }
  }

  async function uploadMusic() {
    if (!musicFile || !musicTitle.trim()) { setError("Add a track title and choose the downloaded audio file first."); return; }
    const trackId = crypto.randomUUID();
    const contentType = musicFile.type || (musicFile.name.toLowerCase().endsWith(".wav") ? "audio/wav" : "audio/mpeg");
    const pathname = `video-producer/music/${trackId}/${safeName(musicFile.name)}`;
    setBusy("music-upload"); setError(""); setMessage("Adding track to the private AG Music Library…"); setMusicUploadProgress(0);
    try {
      await upload(pathname, musicFile, {
        access: "private",
        handleUploadUrl: "/api/admin/video-producer/music/upload",
        multipart: musicFile.size >= MULTIPART_THRESHOLD_BYTES,
        contentType,
        clientPayload: JSON.stringify({
          trackId,
          title: musicTitle.trim(),
          sourceProvider: sunoUrl.trim() ? "suno" : "upload",
          sourceUrl: sunoUrl.trim() || undefined,
          mood: musicMood.trim() || undefined,
          filename: musicFile.name,
          contentType,
          size: musicFile.size
        }),
        onUploadProgress(event) { setMusicUploadProgress(Math.round(event.percentage)); }
      });
      setMessage(`${musicTitle.trim()} added. It can now be reused across Video Producer projects without downloading it again from Suno.`);
      setMusicTitle(""); setSunoUrl(""); setMusicMood(""); setMusicFile(null); setMusicUploadProgress(100);
      window.setTimeout(() => { void load(); }, 1200);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Music upload failed.");
    } finally { setBusy(null); }
  }

  async function generateThumbnails() {
    if (!project) return;
    setBusy("thumbnails"); setError(""); setMessage("Sol is choosing three accurate YouTube concepts, then the media worker will build them from real source frames…");
    try {
      await requestJson("/api/admin/video-producer/thumbnails", { method: "POST", body: JSON.stringify({ projectId: project.id }) });
      setMessage("Three thumbnail candidates are rendering. They will appear here automatically.");
      await load();
    } catch (thumbError) {
      setError(thumbError instanceof Error ? thumbError.message : "Thumbnail generation failed.");
    } finally { setBusy(null); }
  }

  async function sendToPublisher() {
    if (!project) return;
    setBusy("publisher"); setError(""); setMessage("Copying the reviewed master into the existing Publisher library…");
    try {
      const result = await requestJson<{ publisherUrl?: string }>("/api/admin/video-producer/send-to-publisher", { method: "POST", body: JSON.stringify({ projectId: project.id }) });
      setMessage("Publisher handoff started. The private review master stays in Video Producer; a distribution copy is being prepared for Publisher.");
      await load();
      if (result.publisherUrl && data?.publisherRender?.status === "completed") window.location.href = result.publisherUrl;
    } catch (publisherError) {
      setError(publisherError instanceof Error ? publisherError.message : "Publisher handoff failed.");
    } finally { setBusy(null); }
  }

  if (!projectId || !project || !data) return null;

  return (
    <section className={styles.room} aria-label="Video Producer finishing room">
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.eyebrow}>Final production</div>
          <h2>Finishing Room</h2>
          <p>Lock pathway-aware Graphics V2, choose your reusable AG music bed, generate three YouTube thumbnail candidates, then hand the reviewed master to the Publisher you already use.</p>
        </header>

        <div className={styles.grid}>
          <article className={styles.card}>
            <div className={styles.label}><SlidersHorizontal size={14}/> Graphics V2 context</div>
            <h3>Pathway + stops</h3>
            <p className={styles.description}>The pathway drives <b>PATHWAY STOP</b> cards and the persistent left-side follower. Scripture automatically switches to full-frame instead of shrinking when it gets too long.</p>
            <select className={styles.select} value={project.pathway_slug ?? ""} disabled={settingsLocked || busy === "settings"} onChange={(event) => void patch({ pathwaySlug: event.target.value || null })}>
              <option value="">Choose pathway…</option>
              {data.pathways.map((pathway) => <option value={pathway.slug} key={pathway.slug}>{pathway.title}</option>)}
            </select>
            {selectedPathway && <div className={styles.notice}>{selectedPathway.steps.map((step, index) => `Stop ${index + 1}: ${step.title} · ${step.reference}`).join("  •  ")}</div>}
          </article>

          <article className={styles.card}>
            <div className={styles.label}><Music2 size={14}/> AG Music Library</div>
            <h3>Reusable music bed</h3>
            <p className={styles.description}>Download your own Suno track through Suno once, then store that file here privately. Video Producer reuses the AG copy and automatically ducks it under your voice.</p>
            <select className={styles.select} value={project.selected_music_track_id ?? ""} disabled={settingsLocked || busy === "settings"} onChange={(event) => void patch({ musicTrackId: event.target.value || null })}>
              <option value="">No music bed</option>
              {data.musicTracks.map((track) => <option key={track.id} value={track.id}>{track.title}{track.mood ? ` · ${track.mood}` : ""}</option>)}
            </select>
            <div className={styles.trackList}>
              {data.musicTracks.slice(0, 4).map((track) => <div className={styles.track} key={track.id}>
                <div><div className={styles.trackTitle}>{track.title}</div><div className={styles.trackMeta}>{track.source_provider === "suno" ? "Suno import" : "Uploaded"} · {mb(track.size_bytes)}{track.mood ? ` · ${track.mood}` : ""}</div></div>
                {track.previewUrl ? <audio className={styles.audio} controls preload="none" src={track.previewUrl}/> : null}
              </div>)}
            </div>
          </article>

          <article className={`${styles.card} ${styles.cardWide}`}>
            <div className={styles.label}><UploadIcon size={14}/> Add music once</div>
            <h3>Suno / owned-track import</h3>
            <p className={styles.description}>The Suno page is optional provenance only. AG does not scrape or bypass Suno downloads; choose the audio file you downloaded from your own Suno Library/Workspace.</p>
            <div className={styles.fields}>
              <div><label className={styles.fieldLabel}>Track title</label><input className={styles.input} value={musicTitle} onChange={(e)=>setMusicTitle(e.target.value)} placeholder="One God — instrumental bed"/></div>
              <div><label className={styles.fieldLabel}>Suno page URL (optional)</label><input className={styles.input} value={sunoUrl} onChange={(e)=>setSunoUrl(e.target.value)} placeholder="https://suno.com/song/..."/></div>
              <div><label className={styles.fieldLabel}>Mood / use</label><input className={styles.input} value={musicMood} onChange={(e)=>setMusicMood(e.target.value)} placeholder="warm, reflective, intro"/></div>
              <div><label className={styles.fieldLabel}>Downloaded audio</label><input className={styles.input} type="file" accept="audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a,audio/aac,audio/flac" onChange={(e)=>setMusicFile(e.target.files?.[0] ?? null)}/></div>
            </div>
            <div className={styles.buttonRow}><button type="button" className={styles.secondary} disabled={!musicFile || !musicTitle.trim() || busy === "music-upload"} onClick={()=>void uploadMusic()}>{busy === "music-upload" ? <Loader2 size={14}/> : <UploadIcon size={14}/>} {busy === "music-upload" ? `UPLOADING ${musicUploadProgress}%` : "ADD TO MUSIC LIBRARY"}</button></div>
          </article>

          <article className={`${styles.card} ${styles.cardWide}`}>
            <div className={styles.label}><ImageIcon size={14}/> YouTube thumbnail lab</div>
            <h3>Three candidates, one real episode</h3>
            <p className={styles.description}>Video Producer uses the timestamped transcript to choose real source frames and creates three materially different 16:9 concepts: face/hook, doctrine statement, and pathway-clean. No fake expressions or misleading claims.</p>
            {project.mode === "podcast" ? <div className={styles.buttonRow}><button type="button" className={styles.primary} disabled={!project.edit_plan || busy === "thumbnails"} onClick={()=>void generateThumbnails()}>{busy === "thumbnails" ? <Loader2 size={14}/> : <Sparkles size={14}/>} {data.thumbnails.length ? "REGENERATE 3 CANDIDATES" : "GENERATE 3 CANDIDATES"}</button></div> : <div className={styles.notice}>Long-form YouTube thumbnail testing belongs to the parent Podcast project. Reels keep their own vertical cover workflow.</div>}
            {data.thumbnails.length > 0 && <div className={styles.thumbGrid}>{data.thumbnails.map((thumb)=><div className={styles.thumb} key={thumb.id}>
              {thumb.previewUrl ? <img src={thumb.previewUrl} alt={`${thumb.variant} thumbnail: ${thumb.headline}`}/> : <div style={{aspectRatio:"16/9",display:"grid",placeItems:"center",color:"#637985"}}>{thumb.status === "failed" ? "Failed" : "Rendering…"}</div>}
              <div className={styles.thumbBody}><div className={styles.thumbVariant}>{thumb.variant.replace("-"," ")}</div><div className={styles.thumbHeadline}>{thumb.headline}</div><div className={styles.thumbStatus}>{thumb.status}{thumb.error ? ` · ${thumb.error}` : ` · source ${Math.round(thumb.timestamp_seconds)}s`}</div>{thumb.previewUrl && <div className={styles.buttonRow}><a className={styles.secondary} href={thumb.previewUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={12}/> OPEN / SAVE</a></div>}</div>
            </div>)}</div>}
          </article>

          <article className={`${styles.card} ${styles.cardWide}`}>
            <div className={styles.label}><Send size={14}/> Existing Publisher</div>
            <h3>Send the reviewed master over</h3>
            <p className={styles.description}>This is only a handoff. Video Producer keeps its private review master; the finished distribution copy is added to the same Publisher used by the other pathway videos. Nothing is posted automatically.</p>
            <div className={styles.publisherState}>
              {publisherReady ? <CheckCircle2 size={19} color="#75dfb0"/> : publisherWorking ? <Loader2 size={19}/> : <Send size={19}/>} 
              <div><strong>{publisherReady ? "Ready in Publisher" : publisherWorking ? "Copying to Publisher" : data.publisherRender?.status === "failed" ? "Publisher handoff needs retry" : "Not sent yet"}</strong><span>{data.publisherRender?.error || (publisherReady ? "Open Publisher when you are ready to publish manually." : "A completed review master and selected pathway are required.")}</span></div>
            </div>
            <div className={styles.buttonRow}>
              {!publisherReady && <button type="button" className={styles.green} disabled={!selectedPathway || !data.latestCompletedRender || !["review","completed"].includes(project.status) || publisherWorking || busy === "publisher"} onClick={()=>void sendToPublisher()}>{busy === "publisher" || publisherWorking ? <Loader2 size={14}/> : <Send size={14}/>} {data.publisherRender?.status === "failed" ? "RETRY SEND TO PUBLISHER" : "SEND TO PUBLISHER"}</button>}
              {publisherReady && <a className={styles.primary} href={data.publisherUrl}><ExternalLink size={14}/> OPEN PUBLISHER</a>}
            </div>
          </article>
        </div>
        {(message || error) && <div className={`${styles.message} ${error ? styles.error : ""}`}>{error || message}</div>}
      </div>
    </section>
  );
}
