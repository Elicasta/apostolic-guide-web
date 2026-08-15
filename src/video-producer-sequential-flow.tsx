"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Download,
  Film,
  Image as ImageIcon,
  Loader2,
  Music2,
  Play,
  Send,
  SlidersHorizontal,
  Sparkles,
  Smartphone,
  Upload as UploadIcon,
  WandSparkles
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { compileVideoProducerRenderPlan, formatProducerTime, type VideoProducerEditPlan, type VideoProducerMode } from "@/video-producer";
import styles from "./video-producer-sequential.module.css";

export type VideoProducerStep = "source" | "produce" | "finish" | "review" | "deliver";

const STEPS: Array<{ id: VideoProducerStep; label: string; hint: string }> = [
  { id: "source", label: "Source", hint: "Upload + transcript" },
  { id: "produce", label: "Produce", hint: "Sol edit pass" },
  { id: "finish", label: "Finish", hint: "Graphics + sound" },
  { id: "review", label: "Review", hint: "Approve exact plan" },
  { id: "deliver", label: "Deliver", hint: "Render + Publisher" }
];
const MULTIPART_THRESHOLD_BYTES = 100 * 1024 * 1024;

type RenderRow = {
  id: string;
  status: "queued" | "rendering" | "completed" | "failed";
  progress?: { percent?: number; stage?: string; heartbeatAt?: string } | null;
  output_storage_path?: string | null;
  error?: string | null;
};

type ProducerProject = {
  id: string;
  title: string;
  mode: VideoProducerMode;
  status: string;
  parent_project_id?: string | null;
  source_provider?: string | null;
  source_locator?: string | null;
  source_filename?: string | null;
  source_size_bytes?: number | null;
  source_duration?: number | null;
  transcript_local_text?: string | null;
  transcript_local_duration?: number | null;
  edit_plan?: VideoProducerEditPlan | null;
  approval_fingerprint?: string | null;
  approved_at?: string | null;
  pathway_slug?: string | null;
  selected_music_track_id?: string | null;
};

type ProjectDetail = {
  project: ProducerProject;
  renders: RenderRow[];
  sourcePreviewUrl: string | null;
  renderPreviewUrl: string | null;
};

type PathwayOption = { slug: string; title: string; summary: string; steps: Array<{ title: string; reference: string }> };
type MusicTrack = { id: string; title: string; source_provider: string; filename: string; size_bytes: number; mood?: string | null; previewUrl?: string | null };
type Thumbnail = { id: string; variant: "face-hook" | "doctrine" | "pathway"; headline: string; timestamp_seconds: number; status: string; previewUrl?: string | null; error?: string | null };
type FinishingData = {
  project: ProducerProject;
  latestCompletedRender?: { id: string; status: string; output_storage_path?: string | null } | null;
  publisherRender?: { id: string; status: string; output_url?: string | null; error?: string | null } | null;
  publisherUrl: string;
  pathways: PathwayOption[];
  musicTracks: MusicTrack[];
  thumbnails: Thumbnail[];
};

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(-140) || "source.mp4";
}
function titleFromFile(value: string) {
  return value.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim().slice(0, 180) || "Untitled Video";
}
function bytes(value?: number | null) {
  const size = Number(value || 0);
  if (!size) return "—";
  if (size >= 1024 ** 3) return `${(size / 1024 ** 3).toFixed(2)} GB`;
  return `${(size / 1024 ** 2).toFixed(size >= 100 * 1024 ** 2 ? 0 : 1)} MB`;
}
function statusLabel(status?: string) {
  const map: Record<string, string> = {
    draft: "Draft", uploading: "Uploading", uploaded: "Source ready", transcribing: "Transcribing",
    directing: "Sol producing", planned: "Plan ready", approved: "Approved", rendering: "Rendering",
    review: "Master ready", completed: "Complete", failed: "Needs attention"
  };
  return map[status || ""] || status || "New project";
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

export function VideoProducerSequentialFlow({ projectId: initialProjectId = "", step, initialMode = "podcast" }: { projectId?: string; step: VideoProducerStep; initialMode?: VideoProducerMode }) {
  const router = useRouter();
  const [projectId, setProjectId] = useState(initialProjectId);
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [finishing, setFinishing] = useState<FinishingData | null>(null);
  const [mode, setMode] = useState<VideoProducerMode>(initialMode);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [uploadPercent, setUploadPercent] = useState(0);
  const [musicTitle, setMusicTitle] = useState("");
  const [musicMood, setMusicMood] = useState("");
  const [musicSunoUrl, setMusicSunoUrl] = useState("");
  const [musicFile, setMusicFile] = useState<File | null>(null);
  const autoDirectorRef = useRef(false);

  const project = detail?.project ?? finishing?.project ?? null;
  const plan = project?.edit_plan ?? null;
  const renderPlan = useMemo(() => {
    if (!plan) return null;
    try { return compileVideoProducerRenderPlan(plan); } catch { return null; }
  }, [plan]);
  const latestRender = detail?.renders?.[0] ?? null;
  const selectedPathway = finishing?.pathways.find((item) => item.slug === finishing.project.pathway_slug) ?? null;
  const selectedMusic = finishing?.musicTracks.find((item) => item.id === finishing.project.selected_music_track_id) ?? null;
  const stepIndex = STEPS.findIndex((item) => item.id === step);

  const loadDetail = useCallback(async (id = projectId) => {
    if (!id) return null;
    try {
      const data = await json<ProjectDetail>(`/api/admin/video-producer/projects/${id}`);
      setDetail(data);
      setMode(data.project.mode);
      setTitle(data.project.title);
      setError("");
      return data;
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Project could not be loaded.");
      return null;
    }
  }, [projectId]);

  const loadFinishing = useCallback(async (id = projectId) => {
    if (!id) return null;
    try {
      const data = await json<FinishingData>(`/api/admin/video-producer/finishing?projectId=${encodeURIComponent(id)}`);
      setFinishing(data);
      return data;
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Finishing settings could not be loaded.");
      return null;
    }
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    void loadDetail();
    if (["finish", "review", "deliver"].includes(step)) void loadFinishing();
  }, [loadDetail, loadFinishing, projectId, step]);

  useEffect(() => {
    if (!projectId || !project) return;
    const working = ["uploading", "transcribing", "directing", "rendering"].includes(project.status)
      || finishing?.thumbnails.some((thumb) => ["queued", "rendering"].includes(thumb.status))
      || ["queued", "rendering"].includes(finishing?.publisherRender?.status || "");
    if (!working) return;
    const timer = window.setInterval(() => {
      void loadDetail();
      if (["finish", "review", "deliver"].includes(step)) void loadFinishing();
    }, project.status === "rendering" ? 3000 : 5000);
    return () => window.clearInterval(timer);
  }, [finishing?.publisherRender?.status, finishing?.thumbnails, loadDetail, loadFinishing, project, projectId, step]);

  useEffect(() => {
    if (step !== "produce" || !projectId || !detail?.project.transcript_local_text || detail.project.edit_plan || detail.project.status === "directing" || autoDirectorRef.current) return;
    autoDirectorRef.current = true;
    void runDirector();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail?.project.edit_plan, detail?.project.status, detail?.project.transcript_local_text, projectId, step]);

  function go(next: VideoProducerStep) {
    if (!projectId) return;
    router.push(`/admin/video-producer/${projectId}/${next}`);
  }

  function stepAvailable(target: VideoProducerStep) {
    if (!project) return target === "source";
    if (target === "source") return true;
    if (target === "produce") return Boolean(project.transcript_local_text);
    if (target === "finish") return Boolean(project.edit_plan);
    if (target === "review") return Boolean(project.edit_plan);
    if (target === "deliver") return Boolean(project.approval_fingerprint) || ["rendering", "review", "completed"].includes(project.status);
    return false;
  }

  function stepDone(target: VideoProducerStep) {
    if (!project) return false;
    if (target === "source") return Boolean(project.transcript_local_text);
    if (target === "produce") return Boolean(project.edit_plan);
    if (target === "finish") return Boolean(project.edit_plan && (project.mode === "reels" || finishing?.project.pathway_slug));
    if (target === "review") return Boolean(project.approval_fingerprint);
    return ["review", "completed"].includes(project.status) || latestRender?.status === "completed";
  }

  async function uploadSource(file: File) {
    setBusy("upload"); setError(""); setMessage("Preparing private upload…"); setUploadPercent(0);
    try {
      const projectTitle = title.trim() || titleFromFile(file.name);
      const created = await json<{ project: ProducerProject }>("/api/admin/video-producer/projects", {
        method: "POST", body: JSON.stringify({ title: projectTitle, mode })
      });
      const id = created.project.id;
      setProjectId(id); setTitle(projectTitle);
      const mime = file.type || (file.name.toLowerCase().endsWith(".mov") ? "video/quicktime" : "video/mp4");
      await upload(`video-producer/sources/${id}/${safeName(file.name)}`, file, {
        access: "private",
        handleUploadUrl: "/api/admin/video-producer/upload",
        multipart: file.size >= MULTIPART_THRESHOLD_BYTES,
        contentType: mime,
        clientPayload: JSON.stringify({ projectId: id, filename: file.name, contentType: mime, size: file.size }),
        onUploadProgress(event) { setUploadPercent(Math.round(event.percentage)); }
      });
      setUploadPercent(100);
      setMessage("Upload complete. Starting timestamped transcription…");
      await json("/api/admin/video-producer/transcribe", { method: "POST", body: JSON.stringify({ projectId: id }) });
      await loadDetail(id);
      router.replace(`/admin/video-producer/${id}/source`);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
    } finally { setBusy(null); }
  }

  async function startTranscription() {
    if (!projectId) return;
    setBusy("transcribe"); setError("");
    try {
      await json("/api/admin/video-producer/transcribe", { method: "POST", body: JSON.stringify({ projectId }) });
      setMessage("Transcription worker started.");
      await loadDetail();
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Transcription could not start."); }
    finally { setBusy(null); }
  }

  async function runDirector() {
    if (!projectId) return;
    setBusy("direct"); setError(""); setMessage("Sol is building the editorial plan from the timestamped transcript…");
    try {
      await json("/api/admin/video-producer/direct", { method: "POST", body: JSON.stringify({ projectId }) });
      setMessage("Producer pass ready.");
      await loadDetail();
    } catch (actionError) {
      autoDirectorRef.current = false;
      setError(actionError instanceof Error ? actionError.message : "Producer pass failed.");
      await loadDetail();
    } finally { setBusy(null); }
  }

  async function patchFinish(payload: { pathwaySlug?: string | null; musicTrackId?: string | null; audioPreset?: "ag-voice-clean" | "ag-voice-punch" | "none"; colorPreset?: "ag-studio" | "ag-warm" | "ag-clean" | "none" }) {
    if (!projectId) return;
    setBusy("finish"); setError("");
    try {
      await json("/api/admin/video-producer/finishing", { method: "PATCH", body: JSON.stringify({ projectId, ...payload }) });
      setMessage("Finishing choice saved. Final approval will happen on the next page.");
      await Promise.all([loadDetail(), loadFinishing()]);
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Finishing choice could not be saved."); }
    finally { setBusy(null); }
  }

  async function uploadMusic() {
    if (!musicFile || !musicTitle.trim()) return;
    setBusy("music"); setError("");
    try {
      const trackId = crypto.randomUUID();
      const contentType = musicFile.type || (musicFile.name.toLowerCase().endsWith(".wav") ? "audio/wav" : "audio/mpeg");
      await upload(`video-producer/music/${trackId}/${safeName(musicFile.name)}`, musicFile, {
        access: "private",
        handleUploadUrl: "/api/admin/video-producer/music/upload",
        multipart: musicFile.size >= MULTIPART_THRESHOLD_BYTES,
        contentType,
        clientPayload: JSON.stringify({
          trackId, title: musicTitle.trim(), sourceProvider: musicSunoUrl.trim() ? "suno" : "upload",
          sourceUrl: musicSunoUrl.trim() || undefined, mood: musicMood.trim() || undefined,
          filename: musicFile.name, contentType, size: musicFile.size
        })
      });
      setMusicTitle(""); setMusicMood(""); setMusicSunoUrl(""); setMusicFile(null);
      setMessage("Track added to AG Music Library. It can be reused without another Suno download.");
      window.setTimeout(() => void loadFinishing(), 1000);
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Music upload failed."); }
    finally { setBusy(null); }
  }

  async function generateThumbnails() {
    if (!projectId) return;
    setBusy("thumbs"); setError(""); setMessage("Choosing three truthful concepts and rendering them from real frames…");
    try {
      await json("/api/admin/video-producer/thumbnails", { method: "POST", body: JSON.stringify({ projectId }) });
      await loadFinishing();
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Thumbnail generation failed."); }
    finally { setBusy(null); }
  }

  async function approve() {
    if (!projectId) return;
    setBusy("approve"); setError("");
    try {
      await json("/api/admin/video-producer/approve", { method: "POST", body: JSON.stringify({ projectId }) });
      setMessage("Approved. This exact plan is fingerprinted and ready to render.");
      await loadDetail();
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Approval failed."); }
    finally { setBusy(null); }
  }

  async function renderMaster(force = false) {
    if (!projectId) return;
    setBusy("render"); setError("");
    try {
      if (force) await json("/api/admin/video-producer/render-retry", { method: "POST", body: JSON.stringify({ projectId, force: true }) });
      await json("/api/admin/video-producer/render", { method: "POST", body: JSON.stringify({ projectId }) });
      setMessage("Render worker started. You can leave this page and come back later.");
      await loadDetail();
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Render could not start."); }
    finally { setBusy(null); }
  }

  async function sendToPublisher() {
    if (!projectId) return;
    setBusy("publisher"); setError("");
    try {
      await json("/api/admin/video-producer/send-to-publisher", { method: "POST", body: JSON.stringify({ projectId }) });
      setMessage("Distribution copy is being handed to the existing Publisher. Nothing is being posted.");
      await loadFinishing();
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Publisher handoff failed."); }
    finally { setBusy(null); }
  }

  const audioPreset = plan?.audioPreset || (project?.mode === "reels" ? "ag-voice-punch" : "ag-voice-clean");
  const colorPreset = plan?.colorPreset || (project?.mode === "reels" ? "ag-clean" : "ag-studio");
  const finishReady = Boolean(project?.edit_plan && (project.mode === "reels" || finishing?.project.pathway_slug));
  const renderPercent = latestRender?.status === "completed" ? 100 : Math.max(0, Math.min(100, Number(latestRender?.progress?.percent || 0)));

  return (
    <main className={styles.flow}>
      <div className={styles.flowShell}>
        <div className={styles.flowTopline}>
          <Link className={styles.backLink} href="/admin/video-producer"><ArrowLeft size={14}/> Projects</Link>
          <span className={styles.projectBadge}>{project?.title || title || "New project"}</span>
        </div>

        {projectId ? <nav className={styles.stepper} aria-label="Video Producer steps"><div className={styles.stepperTrack}>{STEPS.map((item, index) => {
          const available = stepAvailable(item.id);
          const classes = [styles.step, item.id === step ? styles.stepActive : "", stepDone(item.id) ? styles.stepDone : ""].filter(Boolean).join(" ");
          const content = <><span className={styles.stepNumber}>{stepDone(item.id) ? <Check size={12}/> : index + 1}</span><span className={styles.stepCopy}><strong>{item.label}</strong><small>{item.hint}</small></span></>;
          return available ? <Link className={classes} key={item.id} href={`/admin/video-producer/${projectId}/${item.id}`}>{content}</Link> : <span className={classes} key={item.id}>{content}</span>;
        })}</div></nav> : null}

        {error ? <div className={`${styles.notice} ${styles.warning}`} style={{ marginBottom: 14 }}>{error}</div> : null}
        {message ? <div className={styles.notice} style={{ marginBottom: 14 }}>{message}</div> : null}

        {step === "source" ? (
          <section className={styles.workspace}>
            <WorkspaceHeader eyebrow="Step 1" title={project ? "Source + transcript" : "Start the project"} text={project ? "One source file. Upload and transcription are the only jobs on this page." : "Choose the lane, name the project, and upload the raw recording."} status={statusLabel(project?.status)}/>
            <div className={styles.workspaceBody}><div className={styles.stack}>
              {!project ? <>
                <div className={styles.panel}>
                  <h3 className={styles.panelTitle}>Production lane</h3>
                  <div className={styles.modeChoice}>
                    <button type="button" data-active={mode === "podcast"} onClick={() => setMode("podcast")}><Film size={19}/><span><strong>Podcast</strong><small>16:9 · long form</small></span></button>
                    <button type="button" data-active={mode === "reels"} onClick={() => setMode("reels")}><Smartphone size={19}/><span><strong>Reels</strong><small>9:16 · short form</small></span></button>
                  </div>
                  <div className={styles.field} style={{ marginTop: 14 }}><label>Project title</label><input className={styles.input} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="God Is One — Episode 01"/></div>
                </div>
                <div className={styles.panel}>
                  <h3 className={styles.panelTitle}><UploadIcon size={17}/> Raw recording</h3>
                  <p className={styles.panelText}>The browser uploads directly to private storage. Large files use multipart upload.</p>
                  <input className={styles.fileInput} type="file" accept="video/mp4,video/quicktime,video/x-m4v,video/webm,video/mpeg,video/x-msvideo" disabled={Boolean(busy)} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadSource(file); }}/>
                  {busy === "upload" ? <Progress label="Uploading source" percent={uploadPercent}/> : null}
                </div>
              </> : <>
                <div className={styles.panel}>
                  <h3 className={styles.panelTitle}><Film size={17}/> {project.source_filename || "Source recording"}</h3>
                  <p className={styles.panelText}>{bytes(project.source_size_bytes)} · {project.source_duration ? formatProducerTime(project.source_duration) : "Duration processing"}</p>
                  {detail?.sourcePreviewUrl ? <div className={styles.videoFrame}><video src={detail.sourcePreviewUrl} controls preload="metadata"/></div> : null}
                </div>
                <div className={styles.panel}>
                  <h3 className={styles.panelTitle}><Sparkles size={17}/> Timestamped transcript</h3>
                  {project.status === "transcribing" ? <Progress label="Transcription worker" percent={Math.max(5, Number((project as ProducerProject & { director_metadata?: { transcriptionProgress?: { percent?: number } } }).director_metadata?.transcriptionProgress?.percent || 0))}/> : null}
                  {project.transcript_local_text ? <details className={styles.details} style={{ marginTop: 12 }}><summary>Transcript ready · tap to review</summary><div className={styles.detailsBody}><div className={styles.transcript}>{project.transcript_local_text}</div></div></details> : <p className={styles.panelText}>{project.status === "failed" ? "Transcription needs attention." : "The transcript will appear here when the worker finishes."}</p>}
                  {project.status === "failed" && project.source_locator ? <button className={styles.buttonSecondary} style={{ marginTop: 14 }} disabled={Boolean(busy)} onClick={() => void startTranscription()}>Retry transcription</button> : null}
                </div>
                <div className={styles.stickyActions}>
                  <button className={styles.button} disabled={!project.transcript_local_text} onClick={() => go("produce")}>Continue to Produce <ArrowRight size={15}/></button>
                </div>
              </>}
            </div></div>
          </section>
        ) : null}

        {step === "produce" && project ? (
          <section className={styles.workspace}>
            <WorkspaceHeader eyebrow="Step 2" title="Producer pass" text="Sol reads the timestamped transcript and returns editorial decisions. Code performs the edit." status={statusLabel(project.status)}/>
            <div className={styles.workspaceBody}><div className={styles.stack}>
              <div className={styles.panel}>
                <h3 className={styles.panelTitle}><WandSparkles size={17}/> {project.mode === "podcast" ? "Podcast Producer" : "Reels Producer"}</h3>
                <p className={styles.panelText}>{project.mode === "podcast" ? "Long-form tighten pass, Scripture/teaching structure, restrained motion and broadcast cues." : "Retention edit, animated captions, reframing, punch-ins and short-form overlays."}</p>
                {project.status === "directing" || busy === "direct" ? <Progress label="Sol is directing" percent={55}/> : null}
                {!plan && project.status !== "directing" ? <button className={styles.button} style={{ marginTop: 14 }} disabled={Boolean(busy)} onClick={() => void runDirector()}><Sparkles size={15}/> Run Producer</button> : null}
              </div>
              {plan && renderPlan ? <div className={styles.panel}>
                <h3 className={styles.panelTitle}><Check size={17}/> Producer plan ready</h3>
                <div className={styles.metricGrid}>
                  <Metric label="Source" value={formatProducerTime(plan.sourceDuration)}/><Metric label="Edited" value={formatProducerTime(renderPlan.outputDuration)}/><Metric label="Cuts" value={String(plan.cuts.length)}/><Metric label="Graphics" value={String(plan.overlays.length)}/>
                </div>
                <details className={styles.details} style={{ marginTop: 12 }}><summary>View transcript + edit decisions</summary><div className={styles.detailsBody}>
                  <div className={styles.transcript}>{project.transcript_local_text || "No transcript text."}</div>
                  <div className={styles.decisionList}>{plan.overlays.slice(0, 14).map((overlay) => <div className={styles.decision} key={overlay.id}><small>{overlay.kind} · {formatProducerTime(overlay.start)}</small><strong>{overlay.title}</strong></div>)}</div>
                </div></details>
              </div> : null}
              <div className={styles.stickyActions}><button className={styles.buttonSecondary} onClick={() => go("source")}><ArrowLeft size={15}/> Source</button><button className={styles.button} disabled={!plan} onClick={() => go("finish")}>Continue to Finish <ArrowRight size={15}/></button></div>
            </div></div>
          </section>
        ) : null}

        {step === "finish" && project && finishing ? (
          <section className={styles.workspace}>
            <WorkspaceHeader eyebrow="Step 3" title="Finish" text="Set the visual and sonic treatment once. Advanced engineering stays deterministic behind these presets." status={finishReady ? "Ready for review" : "Needs pathway"}/>
            <div className={styles.workspaceBody}><div className={styles.stack}>
              {project.mode === "podcast" ? <div className={styles.panel}>
                <h3 className={styles.panelTitle}><SlidersHorizontal size={17}/> Pathway + Graphics V2</h3>
                <p className={styles.panelText}>The selected pathway becomes authoritative for Pathway Stop cards, references and the persistent pathway orientation system.</p>
                <select className={styles.select} style={{ marginTop: 12 }} value={finishing.project.pathway_slug || ""} disabled={Boolean(busy)} onChange={(event) => void patchFinish({ pathwaySlug: event.target.value || null })}>
                  <option value="">Choose the episode pathway…</option>{finishing.pathways.map((pathway) => <option key={pathway.slug} value={pathway.slug}>{pathway.title}</option>)}
                </select>
                {selectedPathway ? <details className={styles.details} style={{ marginTop: 10 }}><summary>{selectedPathway.steps.length} pathway stops · tap to inspect</summary><div className={styles.detailsBody}><div className={styles.decisionList}>{selectedPathway.steps.map((item, index) => <div className={styles.decision} key={`${item.reference}-${index}`}><small>Stop {index + 1} · {item.reference}</small><strong>{item.title}</strong></div>)}</div></div></details> : null}
              </div> : null}

              <div className={styles.panel}>
                <h3 className={styles.panelTitle}><Music2 size={17}/> Voice mastering</h3>
                <p className={styles.panelText}>Clean is the natural podcast chain. Punch is tighter and more forward for short-form. Both include EQ, de-essing, compression, limiting and loudness control.</p>
                <div className={styles.choiceGrid}>
                  {[{id:"ag-voice-clean",name:"AG Voice Clean",desc:"Natural · -16 LUFS podcast target"},{id:"ag-voice-punch",name:"AG Voice Punch",desc:"Tighter · -14 LUFS short-form target"},{id:"none",name:"No mastering",desc:"Preserve source audio"}].map((item) => <button type="button" className={styles.choice} data-active={audioPreset === item.id} key={item.id} disabled={Boolean(busy)} onClick={() => void patchFinish({ audioPreset: item.id as "ag-voice-clean" | "ag-voice-punch" | "none" })}><strong>{item.name}</strong><small>{item.desc}</small></button>)}
                </div>
              </div>

              <div className={styles.panel}>
                <h3 className={styles.panelTitle}><Film size={17}/> Color grade</h3>
                <p className={styles.panelText}>These are restrained finishing looks, not destructive LUTs. Camera/log transforms can be added as a separate future input profile.</p>
                <div className={styles.choiceGrid}>
                  {[{id:"ag-studio",name:"AG Studio",desc:"Balanced contrast · cleaner separation"},{id:"ag-warm",name:"AG Warm",desc:"Slightly warmer editorial finish"},{id:"ag-clean",name:"AG Clean",desc:"Neutral, restrained correction"},{id:"none",name:"No grade",desc:"Preserve source color"}].map((item) => <button type="button" className={styles.choice} data-active={colorPreset === item.id} key={item.id} disabled={Boolean(busy)} onClick={() => void patchFinish({ colorPreset: item.id as "ag-studio" | "ag-warm" | "ag-clean" | "none" })}><strong>{item.name}</strong><small>{item.desc}</small></button>)}
                </div>
              </div>

              <div className={styles.panel}>
                <h3 className={styles.panelTitle}><Music2 size={17}/> Music bed</h3>
                <p className={styles.panelText}>Choose a reusable AG track or leave music off. Selected music fades and ducks under the mastered voice automatically.</p>
                <select className={styles.select} style={{ marginTop: 12 }} value={finishing.project.selected_music_track_id || ""} disabled={Boolean(busy)} onChange={(event) => void patchFinish({ musicTrackId: event.target.value || null })}>
                  <option value="">No music bed</option>{finishing.musicTracks.map((track) => <option key={track.id} value={track.id}>{track.title}{track.mood ? ` · ${track.mood}` : ""}</option>)}
                </select>
                {selectedMusic?.previewUrl ? <div className={styles.musicRow}><audio controls preload="none" src={selectedMusic.previewUrl}/></div> : null}
                <details className={styles.details} style={{ marginTop: 10 }}><summary>Add a downloaded Suno / owned track</summary><div className={styles.detailsBody}><div className={styles.fields}>
                  <div className={styles.field}><label>Track title</label><input className={styles.input} value={musicTitle} onChange={(event)=>setMusicTitle(event.target.value)} placeholder="One God — instrumental"/></div>
                  <div className={styles.field}><label>Mood / use</label><input className={styles.input} value={musicMood} onChange={(event)=>setMusicMood(event.target.value)} placeholder="warm, reflective"/></div>
                  <div className={styles.field}><label>Suno URL · optional provenance</label><input className={styles.input} value={musicSunoUrl} onChange={(event)=>setMusicSunoUrl(event.target.value)} placeholder="https://suno.com/song/..."/></div>
                  <div className={styles.field}><label>Downloaded audio</label><input className={styles.fileInput} type="file" accept="audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a,audio/aac,audio/flac" onChange={(event)=>setMusicFile(event.target.files?.[0] ?? null)}/></div>
                </div><button className={styles.buttonSecondary} style={{ marginTop: 12 }} disabled={!musicFile || !musicTitle.trim() || Boolean(busy)} onClick={() => void uploadMusic()}><UploadIcon size={14}/> Add to library</button></div></details>
              </div>

              {project.mode === "podcast" ? <div className={styles.panel}>
                <h3 className={styles.panelTitle}><ImageIcon size={17}/> YouTube thumbnail lab</h3>
                <p className={styles.panelText}>Three materially different candidates from real episode frames: face hook, doctrine and pathway.</p>
                <button className={styles.buttonSecondary} style={{ marginTop: 12 }} disabled={Boolean(busy)} onClick={() => void generateThumbnails()}><Sparkles size={14}/>{finishing.thumbnails.length ? " Regenerate 3 candidates" : " Generate 3 candidates"}</button>
                {finishing.thumbnails.length ? <div className={styles.thumbGrid}>{finishing.thumbnails.map((thumb) => <div className={styles.thumb} key={thumb.variant}><div className={styles.thumbVisual}>{thumb.previewUrl ? <img src={thumb.previewUrl} alt={`${thumb.variant} thumbnail`}/> : ["queued","rendering"].includes(thumb.status) ? <><Loader2 size={18} className={styles.spin}/> Rendering</> : "Not rendered"}</div><div className={styles.thumbCopy}><small>{thumb.variant.replace("-"," ")}</small><strong>{thumb.headline}</strong></div></div>)}</div> : null}
              </div> : null}

              <div className={styles.stickyActions}><button className={styles.buttonSecondary} onClick={() => go("produce")}><ArrowLeft size={15}/> Produce</button><button className={styles.button} disabled={!finishReady} onClick={() => go("review")}>Continue to Review <ArrowRight size={15}/></button></div>
            </div></div>
          </section>
        ) : null}

        {step === "review" && project && finishing ? (
          <section className={styles.workspace}>
            <WorkspaceHeader eyebrow="Step 4" title="Review + approve" text="One final checkpoint. This approval fingerprints the exact edit and finishing configuration that the worker is allowed to render." status={project.approval_fingerprint ? "Approved" : "Waiting for approval"}/>
            <div className={styles.workspaceBody}><div className={styles.stack}>
              <div className={styles.panel}>
                <h3 className={styles.panelTitle}>Final production summary</h3>
                <div className={styles.summaryRows}>
                  <Summary label="Format" value={project.mode === "podcast" ? "Podcast · 1920×1080" : "Reel · 1080×1920"}/>
                  <Summary label="Edited duration" value={renderPlan ? formatProducerTime(renderPlan.outputDuration) : "—"}/>
                  <Summary label="Cuts / overlays" value={`${plan?.cuts.length || 0} cuts · ${plan?.overlays.length || 0} graphics`}/>
                  <Summary label="Pathway" value={selectedPathway?.title || (project.mode === "reels" ? "Inherited / optional" : "Not selected")}/>
                  <Summary label="Voice" value={audioPreset === "ag-voice-clean" ? "AG Voice Clean" : audioPreset === "ag-voice-punch" ? "AG Voice Punch" : "None"}/>
                  <Summary label="Grade" value={colorPreset === "ag-studio" ? "AG Studio" : colorPreset === "ag-warm" ? "AG Warm" : colorPreset === "ag-clean" ? "AG Clean" : "None"}/>
                  <Summary label="Music" value={selectedMusic?.title || "None"}/>
                  {project.mode === "podcast" ? <Summary label="YouTube thumbnails" value={finishing.thumbnails.length ? `${finishing.thumbnails.filter((thumb)=>thumb.status === "completed").length}/3 rendered` : "Not generated · optional"}/> : null}
                </div>
                <details className={styles.details} style={{ marginTop: 12 }}><summary>Inspect edit decisions</summary><div className={styles.detailsBody}><div className={styles.decisionList}>{plan?.overlays.slice(0,18).map((overlay)=><div className={styles.decision} key={overlay.id}><small>{overlay.kind} · {formatProducerTime(overlay.start)}</small><strong>{overlay.title}</strong></div>)}</div></div></details>
              </div>
              {project.mode === "podcast" && !finishing.project.pathway_slug ? <div className={`${styles.notice} ${styles.warning}`}>Choose the episode pathway in Finish before approval. That prevents generic branding from replacing the pathway-aware graphics system.</div> : null}
              {project.approval_fingerprint ? <div className={`${styles.notice} ${styles.success}`}>Approved. Any later change to pathway, music, voice or grade intentionally removes this approval and brings you back here.</div> : null}
              <div className={styles.stickyActions}><button className={styles.buttonSecondary} onClick={() => go("finish")}><ArrowLeft size={15}/> Finish</button>{project.approval_fingerprint ? <button className={styles.button} onClick={() => go("deliver")}>Continue to Deliver <ArrowRight size={15}/></button> : <button className={styles.button} disabled={Boolean(busy) || (project.mode === "podcast" && !finishing.project.pathway_slug)} onClick={() => void approve()}><Check size={15}/> Approve final production</button>}</div>
            </div></div>
          </section>
        ) : null}

        {step === "deliver" && project ? (
          <section className={styles.workspace}>
            <WorkspaceHeader eyebrow="Step 5" title="Render + deliver" text="Render the approved master, review/download it, then hand a distribution copy to the existing Publisher. Nothing posts automatically." status={statusLabel(project.status)}/>
            <div className={styles.workspaceBody}><div className={styles.stack}>
              {detail?.renderPreviewUrl ? <div className={styles.panel}><h3 className={styles.panelTitle}><Play size={17}/> Review master</h3><div className={styles.renderPreview}><video src={detail.renderPreviewUrl} controls preload="metadata"/></div></div> : null}
              <div className={styles.panel}>
                <h3 className={styles.panelTitle}><Film size={17}/> Render worker</h3>
                {latestRender ? <Progress label={latestRender.progress?.stage || latestRender.status} percent={renderPercent}/> : <p className={styles.panelText}>No master has been rendered from this approval yet.</p>}
                {latestRender?.error ? <div className={`${styles.notice} ${styles.warning}`} style={{ marginTop: 12 }}>{latestRender.error}</div> : null}
                {!latestRender || latestRender.status === "failed" ? <button className={styles.button} style={{ marginTop: 14 }} disabled={!project.approval_fingerprint || Boolean(busy)} onClick={() => void renderMaster(latestRender?.status === "failed")}><Play size={14}/>{latestRender?.status === "failed" ? " Restart render" : " Render master"}</button> : null}
              </div>
              {latestRender?.status === "completed" ? <div className={styles.panel}>
                <h3 className={styles.panelTitle}><Download size={17}/> Master ready</h3>
                <p className={styles.panelText}>Private review MP4. The signed download is generated only when you request it.</p>
                <a className={styles.buttonSecondary} style={{ marginTop: 12 }} href={`/api/admin/video-producer/projects/${projectId}/download`} target="_blank" rel="noopener noreferrer"><Download size={14}/> Download master</a>
              </div> : null}
              {finishing && latestRender?.status === "completed" ? <div className={styles.panel}>
                <h3 className={styles.panelTitle}><Send size={17}/> Existing Publisher</h3>
                <p className={styles.panelText}>This is a handoff only. The reviewed master gets a distribution copy in the same Publisher used by the other pathway videos.</p>
                {finishing.publisherRender?.status === "completed" ? <div className={`${styles.notice} ${styles.success}`} style={{ marginTop: 12 }}>Publisher copy ready.</div> : finishing.publisherRender && ["queued","rendering"].includes(finishing.publisherRender.status) ? <Progress label="Copying master to Publisher" percent={65}/> : null}
                <div className={styles.actions}>{finishing.publisherRender?.status === "completed" ? <a className={styles.button} href={finishing.publisherUrl}><Send size={14}/> Open Publisher</a> : <button className={styles.button} disabled={!finishing.project.pathway_slug || Boolean(busy)} onClick={() => void sendToPublisher()}><Send size={14}/> Send to Publisher</button>}</div>
              </div> : null}
              <div className={styles.stickyActions}><button className={styles.buttonSecondary} onClick={() => go("review")}><ArrowLeft size={15}/> Review</button><Link className={styles.button} href="/admin/video-producer">Back to projects</Link></div>
            </div></div>
          </section>
        ) : null}
      </div>
    </main>
  );
}

function WorkspaceHeader({ eyebrow, title, text, status }: { eyebrow: string; title: string; text: string; status: string }) {
  return <header className={styles.workspaceHeader}><div className={styles.workspaceHeaderRow}><div><div className={styles.eyebrow}>{eyebrow}</div><h2>{title}</h2><p>{text}</p></div><span className={styles.statusPill}>{status}</span></div></header>;
}
function Progress({ label, percent }: { label: string; percent: number }) {
  const safe = Math.max(0, Math.min(100, Math.round(percent || 0)));
  return <div className={styles.progressBox}><div className={styles.progressLine}><span>{label}</span><strong>{safe}%</strong></div><div className={styles.progressTrack}><i style={{ width: `${Math.max(safe, safe ? 3 : 0)}%` }}/></div></div>;
}
function Metric({ label, value }: { label: string; value: string }) { return <div className={styles.metric}><small>{label}</small><strong>{value}</strong></div>; }
function Summary({ label, value }: { label: string; value: string }) { return <div className={styles.summaryRow}><span>{label}</span><strong>{value}</strong></div>; }
