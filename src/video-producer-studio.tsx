"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { upload } from "@vercel/blob/client";
import {
  Captions,
  Check,
  Film,
  Loader2,
  Music2,
  Play,
  RefreshCw,
  Scissors,
  Smartphone,
  Sparkles,
  Type,
  Upload,
  WandSparkles,
  ZoomIn
} from "lucide-react";
import {
  compileVideoProducerRenderPlan,
  formatProducerTime,
  VIDEO_PRODUCER_MODE_DEFAULTS,
  type VideoProducerCaptionAnimation,
  type VideoProducerCaptionStyle,
  type VideoProducerEditPlan,
  type VideoProducerMode
} from "@/video-producer";
import type { VideoProducerReelCandidate } from "@/video-producer-ai";

const CAPTION_STYLES: { id: VideoProducerCaptionStyle; label: string; description: string }[] = [
  { id: "kinetic-clean", label: "Kinetic Clean", description: "AG default. Fast emphasis without generic creator-caption energy." },
  { id: "word-pop", label: "Word Pop", description: "Higher-energy word emphasis for hooks and strong statements." },
  { id: "editorial", label: "Editorial", description: "Larger composed typography for theology and teaching clips." },
  { id: "minimal", label: "Minimal", description: "Low-motion captions when the footage should stay dominant." }
];
const CAPTION_ANIMATIONS: { id: VideoProducerCaptionAnimation; label: string }[] = [
  { id: "highlight", label: "Word Highlight" },
  { id: "pop", label: "Pop" },
  { id: "rise", label: "Rise" },
  { id: "none", label: "Static" }
];
const MULTIPART_THRESHOLD_BYTES = 100 * 1024 * 1024;

type UploadStats = {
  loaded: number;
  total: number;
  bytesPerSecond: number;
  etaSeconds: number | null;
  multipart: boolean;
};

type WakeLockHandle = { release: () => Promise<void> };

type ProducerProject = {
  id: string;
  title: string;
  mode: VideoProducerMode;
  status: string;
  parent_project_id: string | null;
  source_provider?: string | null;
  source_locator?: string | null;
  source_filename?: string | null;
  source_size_bytes?: number | null;
  source_duration?: number | null;
  source_range_start?: number | null;
  source_range_end?: number | null;
  transcript_text?: string | null;
  transcript_local_text?: string | null;
  transcript_local_duration?: number | null;
  edit_plan?: VideoProducerEditPlan | null;
  director_metadata?: Record<string, unknown> | null;
  reel_candidates?: VideoProducerReelCandidate[] | null;
  approval_fingerprint?: string | null;
  approved_at?: string | null;
  updated_at?: string;
};

type RenderRow = {
  id: string;
  status: "queued" | "rendering" | "completed" | "failed";
  progress?: { percent?: number; stage?: string; heartbeatAt?: string } | null;
  output_storage_path?: string | null;
  error?: string | null;
  requested_at?: string;
};

type ProjectDetail = {
  project: ProducerProject;
  renders: RenderRow[];
  sourcePreviewUrl: string | null;
  renderPreviewUrl: string | null;
};

type DirectorOptions = {
  captionStyle?: VideoProducerCaptionStyle;
  captionAnimation?: VideoProducerCaptionAnimation;
  producerMode?: VideoProducerMode;
};

function safeSourceName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(-140) || "source.mp4";
}

function titleFromFile(value: string) {
  return value.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim().slice(0, 180) || "Untitled Video";
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 MB";
  const gigabytes = value / (1024 ** 3);
  if (gigabytes >= 1) return `${gigabytes.toFixed(gigabytes >= 10 ? 1 : 2)} GB`;
  const megabytes = value / (1024 ** 2);
  return `${megabytes.toFixed(megabytes >= 100 ? 0 : 1)} MB`;
}

function formatUploadEta(seconds: number | null) {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "Estimating";
  const rounded = Math.max(0, Math.round(seconds));
  if (rounded < 60) return `${rounded}s`;
  const minutes = Math.floor(rounded / 60);
  const remainingSeconds = rounded % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds.toString().padStart(2, "0")}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${(minutes % 60).toString().padStart(2, "0")}m`;
}

function statusLabel(project: ProducerProject | null) {
  if (!project) return "NEW PROJECT";
  if (project.status === "uploading") return "UPLOADING";
  if (project.status === "transcribing") return "TRANSCRIBING";
  if (project.status === "directing") return "SOL DIRECTING";
  if (project.status === "planned") return "PLAN READY";
  if (project.status === "approved") return "APPROVED";
  if (project.status === "rendering") return "RENDERING";
  if (project.status === "review") return "READY TO REVIEW";
  if (project.status === "completed") return "COMPLETE";
  if (project.status === "failed") return "NEEDS ATTENTION";
  return project.source_locator ? "SOURCE READY" : "DRAFT";
}

export function VideoProducerStudio() {
  const [mode, setMode] = useState<VideoProducerMode>("podcast");
  const [title, setTitle] = useState("");
  const [projects, setProjects] = useState<ProducerProject[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState("");
  const [captionStyle, setCaptionStyle] = useState<VideoProducerCaptionStyle>("kinetic-clean");
  const [captionAnimation, setCaptionAnimation] = useState<VideoProducerCaptionAnimation>("highlight");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStats, setUploadStats] = useState<UploadStats>({ loaded: 0, total: 0, bytesPerSecond: 0, etaSeconds: null, multipart: false });
  const autoProduceRef = useRef(false);
  const autoDirectorKeyRef = useRef<string | null>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const uploadProjectIdRef = useRef("");
  const wakeLockRef = useRef<WakeLockHandle | null>(null);

  const project = detail?.project ?? null;
  const plan = project?.edit_plan ?? null;
  const activeMode = project?.mode ?? mode;
  const renderPlan = useMemo(() => {
    if (!plan) return null;
    try { return compileVideoProducerRenderPlan(plan); }
    catch { return null; }
  }, [plan]);
  const defaults = VIDEO_PRODUCER_MODE_DEFAULTS[activeMode];
  const latestRender = detail?.renders?.[0] ?? null;
  const transcriptionMetadata = readRecord(project?.director_metadata);
  const transcriptionProgress = readRecord(transcriptionMetadata.transcriptionProgress);
  const transcriptionError = typeof transcriptionMetadata.transcriptionError === "string" ? transcriptionMetadata.transcriptionError : "";
  const captionSettingsStale = Boolean(
    activeMode === "reels" &&
    plan &&
    (plan.captions.style !== captionStyle || plan.captions.animation !== captionAnimation)
  );

  useEffect(() => { void loadProjects(); }, []);

  useEffect(() => {
    if (!selectedId) return;
    void refreshProject(selectedId);
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId || !project || !["uploading", "transcribing", "directing", "rendering"].includes(project.status)) return;
    const timer = window.setInterval(() => { void refreshProject(selectedId); }, 3000);
    return () => window.clearInterval(timer);
  }, [selectedId, project?.status]);

  useEffect(() => {
    if (busy !== "upload") return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [busy]);

  useEffect(() => () => {
    if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    uploadAbortRef.current?.abort();
    void wakeLockRef.current?.release().catch(() => undefined);
  }, [localPreviewUrl]);

  async function api<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
    return data as T;
  }

  async function loadProjects() {
    try {
      const data = await api<{ projects: ProducerProject[] }>("/api/admin/video-producer/projects", { cache: "no-store" });
      setProjects(data.projects ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Projects could not be loaded.");
    }
  }

  async function refreshProject(id: string) {
    try {
      const data = await api<ProjectDetail>(`/api/admin/video-producer/projects/${id}`, { cache: "no-store" });
      setDetail(data);
      setMode(data.project.mode);
      setTitle(data.project.title);
      if (data.project.edit_plan?.captions) {
        setCaptionStyle(data.project.edit_plan.captions.style);
        setCaptionAnimation(data.project.edit_plan.captions.animation);
      } else if (data.project.mode === "reels") {
        setCaptionStyle("kinetic-clean");
        setCaptionAnimation("highlight");
      } else {
        setCaptionStyle("minimal");
        setCaptionAnimation("none");
      }
      setProjects((current) => {
        const next = [data.project, ...current.filter((item) => item.id !== data.project.id)];
        return next.sort((a, b) => String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")));
      });
      if (
        autoProduceRef.current &&
        data.project.status === "uploaded" &&
        data.project.transcript_local_text &&
        !data.project.edit_plan &&
        autoDirectorKeyRef.current !== data.project.id
      ) {
        autoDirectorKeyRef.current = data.project.id;
        const reelOptions = data.project.mode === "reels"
          ? { captionStyle: "kinetic-clean" as const, captionAnimation: "highlight" as const, producerMode: "reels" as const }
          : { producerMode: "podcast" as const };
        void runDirector(data.project.id, reelOptions);
      }
      return data;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Project could not be refreshed.");
      return null;
    }
  }

  function clearLocalPreview() {
    if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    setLocalPreviewUrl("");
  }

  function resetUploadStats(total = 0, multipart = false) {
    setUploadProgress(0);
    setUploadStats({ loaded: 0, total, bytesPerSecond: 0, etaSeconds: null, multipart });
  }

  async function holdUploadWakeLock() {
    const wakeLock = (navigator as Navigator & { wakeLock?: { request: (kind: "screen") => Promise<WakeLockHandle> } }).wakeLock;
    if (!wakeLock) return;
    try {
      wakeLockRef.current = await wakeLock.request("screen");
    } catch {
      wakeLockRef.current = null;
    }
  }

  async function releaseUploadWakeLock() {
    const lock = wakeLockRef.current;
    wakeLockRef.current = null;
    if (!lock) return;
    try { await lock.release(); }
    catch { /* Wake lock may already be released when the page is backgrounded. */ }
  }

  function selectProject(id: string) {
    clearLocalPreview();
    autoProduceRef.current = false;
    autoDirectorKeyRef.current = null;
    setSelectedId(id);
    setMessage("");
    if (!id) {
      setDetail(null);
      setTitle("");
      resetUploadStats();
    }
  }

  function startNew(nextMode: VideoProducerMode) {
    clearLocalPreview();
    setSelectedId("");
    setDetail(null);
    setMode(nextMode);
    setTitle("");
    setCaptionStyle(nextMode === "reels" ? "kinetic-clean" : "minimal");
    setCaptionAnimation(nextMode === "reels" ? "highlight" : "none");
    setBusy(null);
    setMessage("");
    resetUploadStats();
    autoProduceRef.current = false;
    autoDirectorKeyRef.current = null;
  }

  async function createProject(nextMode: VideoProducerMode, projectTitle: string) {
    const data = await api<{ project: ProducerProject }>("/api/admin/video-producer/projects", {
      method: "POST",
      body: JSON.stringify({ title: projectTitle, mode: nextMode })
    });
    setSelectedId(data.project.id);
    setDetail({ project: data.project, renders: [], sourcePreviewUrl: null, renderPreviewUrl: null });
    return data.project;
  }

  async function cancelUpload() {
    const projectId = uploadProjectIdRef.current;
    uploadAbortRef.current?.abort();
    setMessage("Cancelling the source upload…");
    if (projectId) {
      try {
        await api("/api/admin/video-producer/upload-cancel", { method: "POST", body: JSON.stringify({ projectId }) });
        await refreshProject(projectId);
      } catch {
        // The upload abort is still authoritative. Upload recovery can reconcile a delayed callback.
      }
    }
    resetUploadStats();
  }

  async function uploadSource(file?: File) {
    if (!file) return;
    const mime = file.type || (file.name.toLowerCase().endsWith(".mov") ? "video/quicktime" : "video/mp4");
    const projectTitle = title.trim() || titleFromFile(file.name);
    const multipart = file.size >= MULTIPART_THRESHOLD_BYTES;
    const abortController = new AbortController();
    let activeProjectId = "";
    setBusy("upload");
    setMessage("Preparing a direct private upload…");
    resetUploadStats(file.size, multipart);
    clearLocalPreview();
    const preview = URL.createObjectURL(file);
    setLocalPreviewUrl(preview);
    uploadAbortRef.current = abortController;
    await holdUploadWakeLock();
    try {
      const canReuseDraft = project && !project.parent_project_id && !project.source_locator && project.status === "draft";
      const active = canReuseDraft ? project : await createProject(mode, projectTitle);
      activeProjectId = active.id;
      uploadProjectIdRef.current = active.id;
      const pathname = `video-producer/sources/${active.id}/${safeSourceName(file.name)}`;
      const startedAt = performance.now();
      let sampleAt = startedAt;
      let sampleLoaded = 0;
      let smoothedBytesPerSecond = 0;
      setMessage(`${multipart ? "Parallel multipart" : "Direct single-part"} upload running. Keep this page open; Video Producer will start transcription automatically.`);
      await upload(pathname, file, {
        access: "private",
        handleUploadUrl: "/api/admin/video-producer/upload",
        multipart,
        abortSignal: abortController.signal,
        contentType: mime,
        clientPayload: JSON.stringify({ projectId: active.id, filename: file.name, contentType: mime, size: file.size }),
        onUploadProgress(event) {
          const now = performance.now();
          const elapsedSeconds = Math.max(0.001, (now - startedAt) / 1000);
          const overallBytesPerSecond = event.loaded / elapsedSeconds;
          if (now - sampleAt >= 400 && event.loaded >= sampleLoaded) {
            const sampleSeconds = Math.max(0.001, (now - sampleAt) / 1000);
            const instantBytesPerSecond = (event.loaded - sampleLoaded) / sampleSeconds;
            if (instantBytesPerSecond > 0) {
              smoothedBytesPerSecond = smoothedBytesPerSecond
                ? (smoothedBytesPerSecond * 0.7) + (instantBytesPerSecond * 0.3)
                : instantBytesPerSecond;
            }
            sampleLoaded = event.loaded;
            sampleAt = now;
          }
          const bytesPerSecond = smoothedBytesPerSecond || overallBytesPerSecond;
          const remainingBytes = Math.max(0, event.total - event.loaded);
          const etaSeconds = bytesPerSecond > 1024 ? remainingBytes / bytesPerSecond : null;
          setUploadProgress(Math.round(event.percentage));
          setUploadStats({ loaded: event.loaded, total: event.total, bytesPerSecond, etaSeconds, multipart });
        }
      });
      setUploadProgress(100);
      setUploadStats((current) => ({ ...current, loaded: file.size, total: file.size, etaSeconds: 0 }));
      autoProduceRef.current = true;
      setMessage("Source uploaded. Starting word-level transcription…");
      await startTranscription(active.id);
      await refreshProject(active.id);
      void loadProjects();
    } catch (error) {
      const aborted = abortController.signal.aborted || (error instanceof DOMException && error.name === "AbortError");
      if (aborted) {
        if (activeProjectId) {
          try {
            await api("/api/admin/video-producer/upload-cancel", { method: "POST", body: JSON.stringify({ projectId: activeProjectId }) });
            await refreshProject(activeProjectId);
          } catch { /* Recovery will handle any callback race. */ }
        }
        setMessage("Upload cancelled. The project is ready for another source.");
      } else {
        setMessage(error instanceof Error ? error.message : "Source upload failed.");
      }
    } finally {
      uploadAbortRef.current = null;
      uploadProjectIdRef.current = "";
      await releaseUploadWakeLock();
      setBusy(null);
    }
  }

  async function startTranscription(id = project?.id) {
    if (!id) return;
    setBusy("transcribe");
    setMessage("Dispatching the long-form transcription worker…");
    try {
      await api("/api/admin/video-producer/transcribe", { method: "POST", body: JSON.stringify({ projectId: id }) });
      autoProduceRef.current = true;
      autoDirectorKeyRef.current = null;
      setMessage("Transcription is running. Video Producer will send the completed timestamp map directly to Sol.");
      await refreshProject(id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Transcription could not start.");
    } finally {
      setBusy(null);
    }
  }

  async function runDirector(id = project?.id, options: DirectorOptions = {}) {
    if (!id) return;
    const style = options.captionStyle ?? captionStyle;
    const animation = options.captionAnimation ?? captionAnimation;
    const directingMode = options.producerMode ?? project?.mode ?? mode;
    setBusy("direct");
    setMessage(`${directingMode === "reels" ? "Reels" : "Podcast"} Edit Director is reading the timestamped transcript and building the production plan…`);
    try {
      const data = await api<{ project: ProducerProject; plan: VideoProducerEditPlan; summary: string }>("/api/admin/video-producer/direct", {
        method: "POST",
        body: JSON.stringify({ projectId: id, captionStyle: style, captionAnimation: animation })
      });
      autoProduceRef.current = false;
      setCaptionStyle(data.plan.captions.style);
      setCaptionAnimation(data.plan.captions.animation);
      setDetail((current) => current ? { ...current, project: data.project } : { project: data.project, renders: [], sourcePreviewUrl: null, renderPreviewUrl: null });
      setMessage(data.summary ? `Director pass ready: ${data.summary}` : "Director pass ready for review.");
      void loadProjects();
    } catch (error) {
      autoProduceRef.current = false;
      setMessage(error instanceof Error ? error.message : "Edit Director failed.");
      await refreshProject(id);
    } finally {
      setBusy(null);
    }
  }

  async function approveEdit() {
    if (!project || captionSettingsStale) return;
    setBusy("approve");
    setMessage("Locking this exact edit plan for rendering…");
    try {
      const data = await api<{ project: ProducerProject }>("/api/admin/video-producer/approve", {
        method: "POST", body: JSON.stringify({ projectId: project.id })
      });
      setDetail((current) => current ? { ...current, project: data.project } : current);
      setMessage("Edit approved. The fingerprint now protects this version from stale rendering.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Edit approval failed.");
    } finally { setBusy(null); }
  }

  async function renderMaster() {
    if (!project) return;
    setBusy("render");
    setMessage("Creating an immutable render manifest and dispatching FFmpeg…");
    try {
      await api("/api/admin/video-producer/render", { method: "POST", body: JSON.stringify({ projectId: project.id }) });
      setMessage("Render queued. Progress will update here automatically.");
      await refreshProject(project.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Render could not be queued.");
    } finally { setBusy(null); }
  }

  async function generateReelCandidates() {
    if (!project || project.mode !== "podcast") return;
    setBusy("candidates");
    setMessage("Sol is finding self-contained reel moments in the approved podcast…");
    try {
      const data = await api<{ candidates: VideoProducerReelCandidate[] }>("/api/admin/video-producer/reel-candidates", {
        method: "POST", body: JSON.stringify({ projectId: project.id })
      });
      setDetail((current) => current ? { ...current, project: { ...current.project, reel_candidates: data.candidates } } : current);
      setMessage(`${data.candidates.length} reel candidates are ready.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Reel candidates could not be generated.");
    } finally { setBusy(null); }
  }

  async function createReel(candidate: VideoProducerReelCandidate) {
    if (!project) return;
    setBusy(`reel:${candidate.id}`);
    setMessage(`Creating “${candidate.title}” from the podcast master…`);
    try {
      const data = await api<{ project: ProducerProject }>("/api/admin/video-producer/reels-from-podcast", {
        method: "POST", body: JSON.stringify({ projectId: project.id, candidateId: candidate.id })
      });
      autoProduceRef.current = false;
      autoDirectorKeyRef.current = data.project.id;
      clearLocalPreview();
      setSelectedId(data.project.id);
      setMode("reels");
      setCaptionStyle("kinetic-clean");
      setCaptionAnimation("highlight");
      await refreshProject(data.project.id);
      await runDirector(data.project.id, { captionStyle: "kinetic-clean", captionAnimation: "highlight", producerMode: "reels" });
      void loadProjects();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Reel project could not be created.");
    } finally { setBusy(null); }
  }

  const passItems = activeMode === "podcast"
    ? [
        { label: "Long-form tighten pass", icon: Scissors },
        { label: "AG voice cleanup", icon: Music2 },
        { label: "Professional 16:9 grade", icon: Film },
        { label: "Chapters + Scripture graphics", icon: Type },
        { label: "Intro + outro package", icon: Play }
      ]
    : [
        { label: "Retention edit", icon: Scissors },
        { label: "Animated captions", icon: Captions },
        { label: "Smart 9:16 reframing", icon: Smartphone },
        { label: "Punch-ins + emphasis", icon: ZoomIn },
        { label: "Scripture + CTA overlays", icon: Type }
      ];

  const sourcePreview = localPreviewUrl || detail?.sourcePreviewUrl || "";
  const displayDuration = project?.transcript_local_duration || project?.source_duration || 0;
  const canApprove = project?.status === "planned" && Boolean(plan) && !captionSettingsStale;
  const canRender = project?.status === "approved" && Boolean(project.approval_fingerprint);
  const canExtract = project?.mode === "podcast" && ["approved", "rendering", "review", "completed"].includes(project.status);

  return (
    <main className="min-h-screen bg-[#05070b] text-white">
      <div className="mx-auto max-w-[1540px] px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-6">
          <div>
            <div className="mb-2 text-xs font-bold uppercase tracking-[0.28em] text-[#ff4e55]">Apostolic Guide Media</div>
            <h1 className="text-4xl font-black tracking-tight md:text-5xl">Video Producer</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">Upload once. The system transcribes, directs, renders, reviews, and can turn the approved podcast into its short-form distribution package.</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={selectedId}
              onChange={(event) => selectProject(event.target.value)}
              className="max-w-64 rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-xs text-white/70 outline-none"
            >
              <option value="">New project</option>
              {projects.map((item) => <option key={item.id} value={item.id}>{item.mode === "podcast" ? "Podcast" : "Reel"} · {item.title}</option>)}
            </select>
            <div className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[10px] font-black tracking-[.14em] text-white/65">{statusLabel(project)}</div>
          </div>
        </header>

        <section className="mb-5 grid gap-3 lg:grid-cols-2">
          <ModeCard
            active={activeMode === "podcast"}
            eyebrow="LONG FORM"
            title="Podcast Mode"
            description="Professional episode production with dialogue cleanup, restrained editorial cuts, chapters, Scripture graphics, color, intro/outro and a finished YouTube master."
            spec="16:9 · 1920×1080"
            icon={<Film size={21}/>} onClick={() => startNew("podcast")}
          />
          <ModeCard
            active={activeMode === "reels"}
            eyebrow="SHORT FORM"
            title="Reels Producer"
            description="Standalone vertical shoots or clips inherited from an approved podcast. Animated captions, reframing, punch-ins, Scripture overlays and CTA motion."
            spec="9:16 · 1080×1920"
            icon={<Smartphone size={21}/>} onClick={() => startNew("reels")}
          />
        </section>

        <div className="mb-5 grid gap-5 xl:grid-cols-[1.55fr_.8fr]">
          <section className="space-y-5">
            {!project && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
                <label className="text-[10px] font-bold uppercase tracking-[.18em] text-white/35">Project title</label>
                <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={mode === "podcast" ? "Episode title" : "Reel title"} className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none focus:border-[#4c8dff]/60"/>
              </div>
            )}

            <div className="overflow-hidden rounded-3xl border border-white/10 bg-black shadow-2xl">
              <div className={activeMode === "reels" ? "mx-auto aspect-[9/16] max-h-[680px] bg-black" : "aspect-video bg-black"}>
                {detail?.renderPreviewUrl ? (
                  <video className="h-full w-full object-contain" controls src={detail.renderPreviewUrl}/>
                ) : sourcePreview ? (
                  <video className="h-full w-full object-contain" controls src={sourcePreview}/>
                ) : (
                  <label className="flex h-full min-h-72 cursor-pointer flex-col items-center justify-center gap-4 bg-[radial-gradient(circle_at_center,#182033_0%,#080b11_52%,#030405_100%)] text-white/45">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-5"><Upload size={30}/></div>
                    <div className="text-center"><div className="font-bold text-white/80">Drop in the raw {mode === "podcast" ? "episode" : "reel"}</div><div className="mt-1 text-xs">Direct private upload · large files use parallel multipart · MP4, MOV, M4V, WebM, MPEG or AVI</div></div>
                    <input className="hidden" type="file" accept="video/*" onChange={(event) => void uploadSource(event.target.files?.[0])}/>
                  </label>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-5 py-3 text-xs text-white/50">
                <span>{project?.source_filename || "No source selected"}</span>
                <div className="flex items-center gap-3">
                  {busy === "upload" && <span>{uploadProgress}% · {formatBytes(uploadStats.loaded)} / {formatBytes(uploadStats.total)}</span>}
                  <span>{displayDuration ? formatProducerTime(displayDuration) : "0:00"}</span>
                </div>
              </div>
            </div>

            {busy === "upload" && (
              <div className="rounded-2xl border border-[#4c8dff]/25 bg-[#4c8dff]/[0.07] p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-bold">Uploading source</div>
                    <div className="mt-1 text-xs text-white/45">{uploadStats.multipart ? "Parallel multipart with automatic part retry" : "Direct single-part transfer"} · screen kept awake when supported</div>
                  </div>
                  <button type="button" onClick={() => void cancelUpload()} className="rounded-xl border border-[#ff5b63]/30 bg-[#ff3b3b]/10 px-3 py-2 text-[10px] font-black uppercase tracking-[.12em] text-[#ff8b90]">Cancel</button>
                </div>
                <div className="mt-4 flex items-center justify-between text-xs"><span className="text-white/55">{formatBytes(uploadStats.loaded)} of {formatBytes(uploadStats.total)}</span><span className="font-black">{uploadProgress}%</span></div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/8"><div className="h-full bg-[#6f9dff] transition-all" style={{ width: `${Math.max(1, uploadProgress)}%` }}/></div>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <Metric label="Speed" value={uploadStats.bytesPerSecond > 0 ? `${formatBytes(uploadStats.bytesPerSecond)}/s` : "—"}/>
                  <Metric label="ETA" value={formatUploadEta(uploadStats.etaSeconds)}/>
                  <Metric label="Transfer" value={uploadStats.multipart ? "Parallel" : "Direct"}/>
                </div>
              </div>
            )}

            {message && <div className="rounded-2xl border border-[#4c8dff]/20 bg-[#4c8dff]/[0.07] px-4 py-3 text-xs leading-5 text-white/70">{message}</div>}

            {project && (
              <div className="rounded-3xl border border-white/10 bg-white/[0.025] p-5">
                <div className="mb-4 flex items-center justify-between gap-4">
                  <div><div className="text-sm font-bold">Timestamped transcript</div><div className="mt-1 text-xs text-white/45">Word timing remains authoritative. Text is shown for review; the director edits by timestamp, not paragraph position.</div></div>
                  {project.status === "transcribing" && <Loader2 size={18} className="animate-spin text-[#4c8dff]"/>}
                </div>
                {project.status === "transcribing" ? (
                  <div className="rounded-2xl border border-white/8 bg-black/25 p-5">
                    <div className="flex items-center justify-between text-xs"><span className="text-white/55">{String(transcriptionProgress.stage || "Transcribing")}</span><span className="font-bold">{Number(transcriptionProgress.percent || 0)}%</span></div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/8"><div className="h-full bg-white transition-all" style={{ width: `${Math.max(2, Number(transcriptionProgress.percent || 2))}%` }}/></div>
                  </div>
                ) : project.transcript_local_text ? (
                  <div className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-2xl border border-white/8 bg-black/30 p-4 text-sm leading-7 text-white/70">{project.transcript_local_text}</div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-xs text-white/35">No transcript yet.</div>
                )}
                {!project.transcript_local_text && project.source_locator && project.status !== "transcribing" && (
                  <div className="mt-4">
                    {transcriptionError && <div className="mb-3 text-xs text-[#ff777d]">{transcriptionError}</div>}
                    <button disabled={Boolean(busy)} onClick={() => void startTranscription()} className="rounded-xl border border-white/12 bg-white/[0.05] px-4 py-2.5 text-xs font-black disabled:opacity-40"><RefreshCw size={14} className="mr-2 inline"/>RETRY TRANSCRIPTION</button>
                  </div>
                )}
              </div>
            )}

            {activeMode === "reels" && (
              <div className="rounded-3xl border border-white/10 bg-white/[0.025] p-5">
                <div className="mb-4"><div className="text-sm font-bold">Caption direction</div><div className="mt-1 text-xs text-white/45">These are render rules, not AI suggestions. Changing them requires a fresh director pass before approval.</div></div>
                <div className="grid gap-3 md:grid-cols-2">
                  {CAPTION_STYLES.map((style) => (
                    <button key={style.id} type="button" disabled={Boolean(project?.approval_fingerprint)} onClick={() => setCaptionStyle(style.id)} className={`rounded-2xl border p-4 text-left transition disabled:opacity-45 ${captionStyle === style.id ? "border-[#4c8dff]/60 bg-[#4c8dff]/10" : "border-white/8 bg-black/20 hover:border-white/20"}`}>
                      <div className="flex items-center justify-between gap-3"><span className="text-sm font-bold">{style.label}</span>{captionStyle === style.id && <Check size={15} className="text-[#6aa2ff]"/>}</div>
                      <div className="mt-2 text-xs leading-5 text-white/45">{style.description}</div>
                    </button>
                  ))}
                </div>
                <div className="mt-5 text-[10px] font-bold uppercase tracking-[.18em] text-white/35">Animation</div>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {CAPTION_ANIMATIONS.map((animation) => (
                    <button key={animation.id} type="button" disabled={Boolean(project?.approval_fingerprint)} onClick={() => setCaptionAnimation(animation.id)} className={`rounded-xl border px-3 py-3 text-xs font-bold transition disabled:opacity-45 ${captionAnimation === animation.id ? "border-[#ff5757]/50 bg-[#ff3b3b]/10 text-white" : "border-white/8 bg-black/20 text-white/45 hover:text-white/75"}`}>{animation.label}</button>
                  ))}
                </div>
                {captionSettingsStale && project && !project.approval_fingerprint && (
                  <button disabled={Boolean(busy)} onClick={() => void runDirector(project.id, { captionStyle, captionAnimation, producerMode: "reels" })} className="mt-4 w-full rounded-xl border border-[#4c8dff]/35 bg-[#4c8dff]/10 px-4 py-3 text-xs font-black text-white disabled:opacity-40">APPLY CAPTION DIRECTION + RE-RUN DIRECTOR</button>
                )}
              </div>
            )}

            {project?.mode === "podcast" && canExtract && (
              <div className="rounded-3xl border border-white/10 bg-white/[0.025] p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div><div className="text-sm font-bold">Reels from this podcast</div><div className="mt-1 text-xs text-white/45">Sol ranks self-contained moments. Accepting one creates a child Reels project from the same raw master.</div></div>
                  <button disabled={Boolean(busy)} onClick={() => void generateReelCandidates()} className="rounded-xl bg-white px-4 py-2.5 text-xs font-black text-black disabled:opacity-40">{project.reel_candidates?.length ? "REFRESH CANDIDATES" : "FIND REELS"}</button>
                </div>
                {project.reel_candidates?.length ? <div className="mt-4 grid gap-3 md:grid-cols-2">{project.reel_candidates.map((candidate) => (
                  <div key={candidate.id} className="rounded-2xl border border-white/8 bg-black/25 p-4">
                    <div className="flex items-center justify-between gap-3"><div className="text-[10px] font-black uppercase tracking-[.16em] text-[#4c8dff]">{formatProducerTime(candidate.start)}–{formatProducerTime(candidate.end)}</div><div className="text-xs font-black">{candidate.score}/100</div></div>
                    <div className="mt-2 font-bold">{candidate.title}</div>
                    <div className="mt-1 text-xs leading-5 text-white/50">{candidate.hook}</div>
                    <div className="mt-2 text-[11px] leading-5 text-white/35">{candidate.reason}</div>
                    <button disabled={Boolean(busy)} onClick={() => void createReel(candidate)} className="mt-3 w-full rounded-xl border border-white/12 bg-white/[0.05] px-3 py-2.5 text-xs font-black disabled:opacity-40">CREATE REEL PROJECT</button>
                  </div>
                ))}</div> : null}
              </div>
            )}
          </section>

          <aside className="space-y-5">
            <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
              <div className="mb-5 flex items-center gap-3"><div className="rounded-xl bg-[#ff3b3b]/10 p-2 text-[#ff5757]"><WandSparkles size={19}/></div><div><div className="font-bold">{activeMode === "podcast" ? "Podcast producer" : "Reels producer"}</div><div className="text-xs text-white/45">{defaults.description}</div></div></div>
              <div className="space-y-2 text-sm">
                {passItems.map(({ label, icon: Icon }) => <div key={label} className="flex items-center justify-between rounded-xl border border-white/8 bg-black/20 px-3 py-3"><span className="flex items-center gap-2 text-white/70"><Icon size={15}/>{label}</span><Check size={15} className="text-emerald-400"/></div>)}
              </div>
              {project?.transcript_local_text && !plan && project.status !== "directing" && <button disabled={Boolean(busy)} onClick={() => void runDirector()} className="mt-5 w-full rounded-xl bg-white px-4 py-3 text-sm font-black text-black disabled:opacity-30">RUN {activeMode === "podcast" ? "PODCAST" : "REELS"} DIRECTOR</button>}
              {project?.status === "directing" && <div className="mt-5 flex items-center justify-center gap-2 rounded-xl border border-white/8 bg-black/25 px-4 py-3 text-xs text-white/55"><Loader2 size={15} className="animate-spin"/> Sol is directing this edit</div>}
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.025] p-5">
              <div className="mb-4 flex items-center justify-between gap-3"><div className="text-sm font-bold">Edit plan</div>{renderPlan && <div className="text-[10px] font-bold uppercase tracking-[.16em] text-[#4c8dff]">{renderPlan.output.width}×{renderPlan.output.height}</div>}</div>
              <div className="grid grid-cols-2 gap-3">
                <Metric label="Source" value={displayDuration ? formatProducerTime(displayDuration) : "0:00"}/>
                <Metric label="Edited" value={renderPlan ? formatProducerTime(renderPlan.outputDuration) : "0:00"}/>
                <Metric label="Cuts" value={String(plan?.cuts.length ?? 0)}/>
                <Metric label={activeMode === "reels" ? "Graphics" : "Overlays"} value={String(plan?.overlays.length ?? 0)}/>
              </div>
              {plan?.overlays.length ? <div className="mt-4 max-h-72 space-y-2 overflow-y-auto">{plan.overlays.slice(0, 12).map((overlay) => <div key={overlay.id} className="rounded-xl border border-white/8 bg-black/25 p-3"><div className="text-[10px] font-bold uppercase tracking-[.18em] text-[#4c8dff]">{overlay.kind} · {formatProducerTime(overlay.start)}{overlay.animation ? ` · ${overlay.animation}` : ""}</div><div className="mt-1 text-sm font-semibold">{overlay.title}</div></div>)}</div> : <div className="mt-4 rounded-xl border border-dashed border-white/10 p-5 text-center text-xs text-white/35">No edit decisions yet.</div>}
              {captionSettingsStale && <div className="mt-3 rounded-xl border border-[#ffb45a]/20 bg-[#ffb45a]/[0.06] px-3 py-2 text-[11px] leading-5 text-white/55">Caption direction changed after this plan was generated. Re-run the Reels Director before approval.</div>}
              {canApprove && <button disabled={Boolean(busy)} onClick={() => void approveEdit()} className="mt-4 w-full rounded-xl bg-[#e72c33] px-4 py-3 text-sm font-black text-white disabled:opacity-30">APPROVE EDIT</button>}
              {canRender && <button disabled={Boolean(busy)} onClick={() => void renderMaster()} className="mt-4 w-full rounded-xl bg-[#e72c33] px-4 py-3 text-sm font-black text-white disabled:opacity-30">RENDER MASTER</button>}
            </div>

            {latestRender && (
              <div className="rounded-3xl border border-white/10 bg-white/[0.025] p-5">
                <div className="flex items-center justify-between"><div className="text-sm font-bold">Render worker</div><div className="text-[10px] font-black uppercase tracking-[.15em] text-white/40">{latestRender.status}</div></div>
                <div className="mt-3 flex items-center justify-between text-xs"><span className="text-white/50">{latestRender.progress?.stage || latestRender.status}</span><span className="font-bold">{latestRender.progress?.percent ?? (latestRender.status === "completed" ? 100 : 0)}%</span></div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/8"><div className="h-full bg-white transition-all" style={{ width: `${latestRender.progress?.percent ?? (latestRender.status === "completed" ? 100 : 2)}%` }}/></div>
                {latestRender.error && <div className="mt-3 text-xs leading-5 text-[#ff777d]">{latestRender.error}</div>}
              </div>
            )}

            <div className="rounded-3xl border border-white/10 bg-white/[0.025] p-5 text-xs leading-5 text-white/45">
              <div className="font-bold text-white/80">Production boundary</div>
              <p className="mt-2">Sol returns editorial decisions. The server validates them. FFmpeg executes the approved immutable manifest. Raw source files and review masters stay private.</p>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

function ModeCard({ active, eyebrow, title, description, spec, icon, onClick }: { active: boolean; eyebrow: string; title: string; description: string; spec: string; icon: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`group rounded-3xl border p-5 text-left transition ${active ? "border-[#4c8dff]/60 bg-[linear-gradient(135deg,rgba(76,141,255,.14),rgba(231,44,51,.06))] shadow-[0_0_40px_rgba(76,141,255,.08)]" : "border-white/10 bg-white/[0.025] hover:border-white/20"}`}>
      <div className="flex items-start justify-between gap-4"><div className={`rounded-2xl border p-3 ${active ? "border-[#4c8dff]/30 bg-[#4c8dff]/10 text-[#78aaff]" : "border-white/10 bg-black/20 text-white/55"}`}>{icon}</div><div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[10px] font-bold uppercase tracking-[.16em] text-white/45">{spec}</div></div>
      <div className="mt-5 text-[10px] font-bold uppercase tracking-[.22em] text-[#ff5757]">{eyebrow}</div>
      <div className="mt-1 text-2xl font-black">{title}</div>
      <div className="mt-2 max-w-xl text-xs leading-5 text-white/50">{description}</div>
      <div className="mt-4 flex items-center gap-2 text-xs font-bold text-white/70">{active ? <><Check size={14} className="text-emerald-400"/> ACTIVE LANE</> : "START NEW"}</div>
    </button>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-white/8 bg-black/25 p-3"><div className="text-[10px] font-bold uppercase tracking-[.16em] text-white/35">{label}</div><div className="mt-1 text-xl font-black">{value}</div></div>;
}
