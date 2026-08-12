"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Film, Loader2, Play, RefreshCw, Save, Sparkles, TimerReset, Youtube } from "lucide-react";
import { PathwayVideoPublishingKit } from "@/pathway-video-publishing-kit";
import {
  activePathwayVideoChapter,
  activePathwayVideoCue,
  buildEstimatedPathwayVideoTimeline,
  buildPathwayVideoChapters,
  formatVideoTimestamp,
  normalizePathwayVideoTimeline,
  VIDEO_FORMATS,
  type PathwayVideoCue,
  type PathwayVideoFormat,
  type PathwayVideoStep
} from "@/pathway-video";

type RenderRow = {
  id: string;
  pathway_slug: string;
  format: PathwayVideoFormat;
  status: "queued" | "rendering" | "completed" | "failed";
  output_url: string | null;
  error: string | null;
  requested_at: string;
  completed_at: string | null;
  progress_percent?: number;
  progress_stage?: string;
  progress_heartbeat_at?: string | null;
};

type VideoProject = {
  id: string;
  audioContentHash: string | null;
  timeline: PathwayVideoCue[] | null;
  style: Record<string, unknown>;
  updatedAt: string;
};

type StudioPathway = {
  slug: string;
  title: string;
  summary: string;
  estimatedMinutes: number;
  steps: PathwayVideoStep[];
  audioUrl: string | null;
  audioContentHash: string | null;
  audioGeneratedAt: string | null;
  scriptApproved: boolean;
  project: VideoProject | null;
  renders: RenderRow[];
};

type AlignmentState = {
  status?: string;
  confidence?: string;
  matchedScriptureCues?: number;
  totalScriptureCues?: number;
  matchedDirectedCues?: number;
  totalDirectedCues?: number;
  totalVideoCues?: number;
  analyzedAt?: string;
};

function formatLabel(format: PathwayVideoFormat) {
  if (format === "youtube") return "YouTube 16:9";
  if (format === "vertical") return "Reel / TikTok 9:16";
  return "Square 1:1";
}

function renderStatusLabel(render: RenderRow) {
  if (render.status === "queued") return "Queued";
  if (render.status === "rendering") return "Rendering";
  if (render.status === "completed") return "Ready to review";
  return "Failed";
}

function renderProgressValue(render: RenderRow | undefined) {
  if (!render) return 0;
  const fallback = render.status === "completed" ? 100 : render.status === "rendering" ? 7 : render.status === "queued" ? 1 : 0;
  return Math.round(Math.max(0, Math.min(100, Number(render.progress_percent ?? fallback))));
}

function readAlignment(style: Record<string, unknown> | undefined): AlignmentState | null {
  const value = style?.alignment;
  return value && typeof value === "object" ? value as AlignmentState : null;
}

function projectFromApi(value: unknown): VideoProject | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string") return null;
  return {
    id: row.id,
    audioContentHash: typeof row.audio_content_hash === "string" ? row.audio_content_hash : null,
    timeline: Array.isArray(row.timeline) ? row.timeline as PathwayVideoCue[] : null,
    style: row.style && typeof row.style === "object" ? row.style as Record<string, unknown> : {},
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : new Date().toISOString()
  };
}

export function PathwayVideoStudio({
  pathways,
  databaseReady,
  rendererReady
}: {
  pathways: StudioPathway[];
  databaseReady: boolean;
  rendererReady: boolean;
}) {
  const available = pathways.filter((pathway) => pathway.audioUrl);
  const [selectedSlug, setSelectedSlug] = useState(available[0]?.slug ?? pathways[0]?.slug ?? "");
  const selected = pathways.find((pathway) => pathway.slug === selectedSlug) ?? pathways[0];
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const autoAnalyzeKeyRef = useRef<string | null>(null);
  const [localProjects, setLocalProjects] = useState<Record<string, VideoProject>>({});
  const effectiveProject = selected ? (localProjects[selected.slug] ?? selected.project) : null;
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [format, setFormat] = useState<PathwayVideoFormat>("youtube");
  const [timeline, setTimeline] = useState<PathwayVideoCue[]>([]);
  const [selectedCueId, setSelectedCueId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [renders, setRenders] = useState<RenderRow[]>(selected?.renders ?? []);
  const [renderErrors, setRenderErrors] = useState<Partial<Record<PathwayVideoFormat, string>>>({});
  const [reviewRenderId, setReviewRenderId] = useState<string | null>(null);
  const [projectSaved, setProjectSaved] = useState(Boolean(effectiveProject));
  const alignment = readAlignment(effectiveProject?.style);
  const timingCurrent = Boolean(selected?.audioContentHash && effectiveProject?.audioContentHash === selected.audioContentHash && alignment?.status === "aligned-rich");

  useEffect(() => {
    setDuration(0);
    setCurrentTime(0);
    setMessage("");
    setRenderErrors({});
    setReviewRenderId(null);
    setRenders(selected?.renders ?? []);
    const project = selected ? (localProjects[selected.slug] ?? selected.project) : null;
    const current = Boolean(project && selected?.audioContentHash && project.audioContentHash === selected.audioContentHash);
    setProjectSaved(current);
    const saved = current ? project?.timeline : null;
    setTimeline(saved?.length ? saved : []);
    setSelectedCueId(saved?.[0]?.id ?? null);
  }, [selectedSlug]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selected || !duration || timeline.length) return;
    const next = buildEstimatedPathwayVideoTimeline(selected, duration);
    setTimeline(next);
    setSelectedCueId(next[0]?.id ?? null);
  }, [duration, selected, timeline.length]);

  useEffect(() => {
    if (!renders.some((render) => render.status === "queued" || render.status === "rendering")) return;
    const poll = async () => {
      try {
        const response = await fetch(`/api/admin/video-studio/renders?slug=${encodeURIComponent(selected.slug)}`, { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (response.ok && Array.isArray(data.renders)) setRenders(data.renders);
      } catch { /* next poll will retry */ }
    };
    void poll();
    const timer = window.setInterval(poll, 2000);
    return () => window.clearInterval(timer);
  }, [renders.some((render) => render.status === "queued" || render.status === "rendering"), selected?.slug]);

  const activeCue = useMemo(() => activePathwayVideoCue(timeline, currentTime), [timeline, currentTime]);
  const selectedCue = timeline.find((cue) => cue.id === selectedCueId) ?? activeCue;
  const chapters = useMemo(() => buildPathwayVideoChapters(timeline, selected?.title ?? "Pathway"), [timeline, selected?.title]);
  const activeChapter = useMemo(() => activePathwayVideoChapter(chapters, currentTime), [chapters, currentTime]);
  const visibleChapters = useMemo(() => chapters.filter((chapter) => chapter.label !== "INTRO" && chapter.label !== "COMPLETE"), [chapters]);
  const activeChapterIndex = activeChapter ? visibleChapters.findIndex((chapter) => chapter.cueId === activeChapter.cueId) : -1;
  const ratio = VIDEO_FORMATS[format];
  const progress = duration ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;
  const latestByFormat = useMemo(() => {
    const result = new Map<PathwayVideoFormat, RenderRow>();
    for (const render of renders) if (!result.has(render.format)) result.set(render.format, render);
    return result;
  }, [renders]);
  const readyRenders = useMemo(() => renders.filter((render) => render.status === "completed" && Boolean(render.output_url)), [renders]);
  const reviewRender = useMemo(() => readyRenders.find((render) => render.id === reviewRenderId) ?? readyRenders[0] ?? null, [readyRenders, reviewRenderId]);

  useEffect(() => {
    if (!readyRenders.length) {
      setReviewRenderId(null);
      return;
    }
    setReviewRenderId((current) => current && readyRenders.some((render) => render.id === current) ? current : readyRenders[0].id);
  }, [readyRenders]);

  async function analyzeAudio(force = false) {
    if (!selected?.audioUrl || !selected.scriptApproved || !databaseReady) return null;
    const key = `${selected.slug}:${selected.audioContentHash ?? "audio"}`;
    setBusy("analyze");
    setMessage(force ? "Re-directing the narration and rebuilding every visual beat…" : "Analyzing the narration, directing talking points, and matching every beat automatically…");
    try {
      const response = await fetch("/api/admin/video-studio/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug: selected.slug, force })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Audio timing could not be analyzed.");
      const project = projectFromApi(data.project);
      if (!project?.timeline?.length) throw new Error("Audio analysis did not return a usable timeline.");
      setLocalProjects((current) => ({ ...current, [selected.slug]: project }));
      setTimeline(project.timeline);
      setSelectedCueId(project.timeline[0]?.id ?? null);
      setProjectSaved(true);
      autoAnalyzeKeyRef.current = key;
      const result = data.alignment as AlignmentState | undefined;
      const matched = Number(result?.matchedScriptureCues ?? selected.steps.length);
      const total = Number(result?.totalScriptureCues ?? selected.steps.length);
      const beatCount = Number(result?.totalVideoCues ?? project.timeline.length);
      setMessage(`${beatCount} visual beats ready · ${matched}/${total} Scripture sections matched${result?.confidence ? ` · ${result.confidence} confidence` : ""}. Set here remains correction-only.`);
      return project;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Audio timing could not be analyzed.");
      return null;
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    if (!selected?.audioUrl || !selected.scriptApproved || !databaseReady || !duration || timingCurrent || busy) return;
    const key = `${selected.slug}:${selected.audioContentHash ?? "audio"}`;
    if (autoAnalyzeKeyRef.current === key) return;
    autoAnalyzeKeyRef.current = key;
    void analyzeAudio(false);
  }, [selected?.slug, selected?.audioUrl, selected?.audioContentHash, selected?.scriptApproved, databaseReady, duration, timingCurrent]); // eslint-disable-line react-hooks/exhaustive-deps

  function rebuildEstimatedTimeline() {
    if (!selected) return;
    const estimatedDuration = duration || selected.estimatedMinutes * 60;
    const next = buildEstimatedPathwayVideoTimeline(selected, estimatedDuration);
    setTimeline(next);
    setSelectedCueId(next[0]?.id ?? null);
    setProjectSaved(false);
    setMessage("Using the rich estimated template. Re-analyze audio to restore GPT-directed, script-matched talking points.");
  }

  function updateCue(id: string, patch: Partial<PathwayVideoCue>) {
    setTimeline((current) => current.map((cue) => cue.id === id ? { ...cue, ...patch } : cue));
    setProjectSaved(false);
  }

  function setCueAtPlayhead(id: string) {
    setTimeline((current) => normalizePathwayVideoTimeline(current.map((cue) => cue.id === id ? { ...cue, start: Number(currentTime.toFixed(2)) } : cue), duration || Number.MAX_SAFE_INTEGER));
    setProjectSaved(false);
  }

  function previewCue(cue: PathwayVideoCue) {
    if (!audioRef.current) return;
    audioRef.current.currentTime = cue.start;
    setCurrentTime(cue.start);
    void audioRef.current.play().catch(() => undefined);
  }

  async function saveProject(silent = false) {
    if (!selected || !databaseReady) return null;
    setBusy("save");
    if (!silent) setMessage("");
    try {
      const normalized = normalizePathwayVideoTimeline(timeline, duration || Number.MAX_SAFE_INTEGER);
      const response = await fetch("/api/admin/video-studio/project", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug: selected.slug, timeline: normalized, style: { ...(effectiveProject?.style ?? {}), brandVersion: 2, template: "audio-first-rich-v1" } })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Video project could not be saved.");
      const project = projectFromApi(data.project);
      setTimeline(normalized);
      if (project) setLocalProjects((current) => ({ ...current, [selected.slug]: project }));
      setProjectSaved(true);
      if (!silent) setMessage("Video timeline saved.");
      return project ?? { id: "saved" };
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Video project could not be saved.");
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function requestRender(targetFormat: PathwayVideoFormat) {
    if (!selected?.audioUrl) return;
    setMessage("");
    setRenderErrors((current) => ({ ...current, [targetFormat]: "" }));
    if (!rendererReady) {
      setRenderErrors((current) => ({ ...current, [targetFormat]: "Video renderer is not connected yet. Open Setup → Video renderer first." }));
      return;
    }
    try {
      if (!projectSaved) {
        const project = await saveProject(true);
        if (!project) throw new Error("Save the video timeline before rendering.");
      }
      setBusy(`render:${targetFormat}`);
      const response = await fetch("/api/admin/video-studio/render", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug: selected.slug, formats: [targetFormat] })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Render could not be queued.");
      if (Array.isArray(data.renders)) setRenders((current) => data.renders.map((render: RenderRow) => ({ ...render, progress_percent: 1, progress_stage: "Queued" })).concat(current));
      setMessage(`${formatLabel(targetFormat)} render queued. Live progress will update here automatically, and the finished MP4 will appear in Final render review.`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Render could not be queued.";
      setRenderErrors((current) => ({ ...current, [targetFormat]: detail }));
    } finally {
      setBusy(null);
    }
  }

  if (!selected) return <div className="studio-empty-state"><strong>No Pathways are available.</strong></div>;

  return <div className="video-studio-page">
    <div className="studio-page-heading video-studio-heading">
      <div>
        <span className="eyebrow">Publishing</span>
        <h1>Video Studio</h1>
        <p className="admin-lede">Turn approved Pathway audio into the rich Apostolic Guide visualizer format. Scripture cards, supporting talking points, recap beats, section tracking, and timing are directed automatically from the approved narration.</p>
      </div>
      <div className="video-studio-heading-actions">
        <button type="button" className="button" disabled={!selected.audioUrl || !selected.scriptApproved || busy === "analyze"} onClick={() => void analyzeAudio(true)}>{busy === "analyze" ? <Loader2 className="spin" size={16}/> : <Sparkles size={16}/>} {timingCurrent ? "Re-direct video" : "Analyze & direct"}</button>
        <button type="button" className="button primary" disabled={!databaseReady || busy === "save"} onClick={() => void saveProject()}>{busy === "save" ? <Loader2 className="spin" size={16}/> : <Save size={16}/>} Save</button>
      </div>
    </div>

    {!databaseReady ? <div className="admin-notice"><strong>Video Studio database migration is not applied yet.</strong> Previewing works now. Saving and rendering become active after the new Pathway video migration is applied.</div> : null}
    {message ? <div className="admin-notice">{message}</div> : null}

    <section className="video-studio-sourcebar admin-card">
      <label><span>Pathway source</span><select value={selected.slug} onChange={(event) => setSelectedSlug(event.target.value)}>{pathways.map((pathway) => <option key={pathway.slug} value={pathway.slug}>{pathway.title}{pathway.audioUrl ? "" : " · no audio"}</option>)}</select></label>
      <div className="video-source-status"><span className={selected.audioUrl ? "status-dot is-ready" : "status-dot"}/><div><strong>{selected.audioUrl ? "Audio ready" : "Audio missing"}</strong><small>{selected.audioGeneratedAt ? `Generated ${new Date(selected.audioGeneratedAt).toLocaleString()}` : "Generate the Pathway audio first."}</small></div></div>
      <div className="video-source-status"><span className={selected.scriptApproved ? "status-dot is-ready" : "status-dot"}/><div><strong>{selected.scriptApproved ? "Script approved" : "Script not approved"}</strong><small>{selected.steps.length} Scripture stops in the live Pathway</small></div></div>
      <div className="video-source-status"><span className={timingCurrent ? "status-dot is-ready" : "status-dot"}/><div><strong>{busy === "analyze" ? "Directing video" : timingCurrent ? "Rich timeline ready" : "Direction pending"}</strong><small>{timingCurrent ? `${alignment?.totalVideoCues ?? timeline.length} visual beats · ${alignment?.matchedScriptureCues ?? selected.steps.length}/${alignment?.totalScriptureCues ?? selected.steps.length} Scripture` : "Runs automatically when audio opens."}</small></div></div>
    </section>

    <div className="video-studio-grid">
      <section className="admin-card video-preview-card">
        <div className="video-card-heading"><div><span className="section-kicker">Master-template preview</span><h2>{selected.title}</h2></div><span>{ratio.width} × {ratio.height}</span></div>

        <div className={`pathway-video-preview is-${format} is-${activeCue?.kind ?? "scripture"}-cue`} style={{ aspectRatio: `${ratio.width}/${ratio.height}` }}>
          <div className="video-preview-ambient video-preview-ambient-red"/><div className="video-preview-ambient video-preview-ambient-blue"/><div className="video-preview-grain"/>
          {activeCue?.kind === "brand" ? <img className="video-preview-hero-wordmark" src="/brand/apostolic-guide-wordmark-reversed.png" alt="Apostolic Guide"/> : <img className="video-preview-wordmark" src="/brand/apostolic-guide-wordmark-reversed.png" alt="Apostolic Guide"/>}
          <div className="video-preview-pathway">{selected.title.toUpperCase()} · PATHWAY</div>
          <div className="video-preview-copy">
            <span>{activeCue?.eyebrow || "APOSTOLIC GUIDE"}</span>
            <strong>{activeCue?.title || selected.title}</strong>
            {activeCue?.body ? <p>{activeCue.body}</p> : null}
          </div>
          <div className="video-preview-spectrum" aria-hidden="true">{Array.from({ length: format === "vertical" ? 34 : 54 }, (_, index) => {
            const motion = 0.24 + Math.abs(Math.sin(currentTime * 2.1 + index * 0.67) * Math.cos(currentTime * 0.7 + index * 0.21)) * 0.76;
            return <i key={index} style={{ height: `${Math.round(motion * 100)}%` }}/>;
          })}</div>
          <div className="video-preview-footer">
            <div className="video-preview-chapter"><strong>{activeChapter?.label || "INTRO"}</strong><span>{activeChapter?.reference || selected.title.toUpperCase()}</span></div>
            <div className="video-preview-chapter-dots" aria-hidden="true">{visibleChapters.map((chapter, index) => <i key={chapter.cueId} className={index === activeChapterIndex ? "is-active" : ""}/>)}</div>
            <span className="video-preview-time">{formatVideoTimestamp(currentTime)} / {formatVideoTimestamp(duration)}</span>
          </div>
          <div className="video-preview-progress"><i style={{ width: `${progress}%` }}/></div>
        </div>

        <div className="video-format-tabs">{(Object.keys(VIDEO_FORMATS) as PathwayVideoFormat[]).map((key) => <button type="button" key={key} className={format === key ? "is-active" : ""} onClick={() => setFormat(key)}><strong>{VIDEO_FORMATS[key].label}</strong><span>{VIDEO_FORMATS[key].purpose}</span></button>)}</div>

        {selected.audioUrl ? <audio
          ref={audioRef}
          className="video-studio-audio"
          controls
          src={selected.audioUrl}
          onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}
          onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
          onSeeked={(event) => setCurrentTime(event.currentTarget.currentTime)}
        /> : <div className="studio-empty-state compact"><strong>No source audio</strong><p>Generate the approved Pathway narration in Pathway Audio, then return here.</p></div>}
      </section>

      <section className="admin-card video-timeline-card">
        <div className="video-card-heading"><div><span className="section-kicker">Timeline</span><h2>Visual beats</h2></div><button type="button" className="button small" onClick={rebuildEstimatedTimeline}><TimerReset size={15}/> Rich estimate</button></div>
        <p className="video-timeline-help">GPT-5.6 Sol directs the talking points from the approved narration, then the finished audio is word-aligned to place them. <strong>Set here is correction-only.</strong></p>
        <div className="video-cue-list">{timeline.map((cue, index) => <article key={cue.id} className={selectedCue?.id === cue.id ? "video-cue is-selected" : "video-cue"} onClick={() => setSelectedCueId(cue.id)}>
          <div className="video-cue-index"><span>{String(index + 1).padStart(2, "0")} · {cue.kind.toUpperCase()}</span><strong>{formatVideoTimestamp(cue.start)}</strong></div>
          <div className="video-cue-fields">
            <input aria-label="Cue eyebrow" value={cue.eyebrow} onChange={(event) => updateCue(cue.id, { eyebrow: event.target.value })}/>
            <textarea aria-label="Cue title" rows={2} value={cue.title} onChange={(event) => updateCue(cue.id, { title: event.target.value })}/>
            <textarea aria-label="Cue body" rows={2} value={cue.body} onChange={(event) => updateCue(cue.id, { body: event.target.value })}/>
            <div className="video-cue-actions"><label>Start <input type="number" step="0.1" min="0" max={duration || undefined} value={cue.start} onChange={(event) => updateCue(cue.id, { start: Number(event.target.value) })}/></label><button type="button" onClick={(event) => { event.stopPropagation(); setCueAtPlayhead(cue.id); }}>Set here</button><button type="button" onClick={(event) => { event.stopPropagation(); previewCue(cue); }}><Play size={13}/> Preview</button></div>
          </div>
        </article>)}</div>
      </section>
    </div>

    <section className="admin-card video-export-card">
      <div className="video-card-heading"><div><span className="section-kicker">Render queue</span><h2>Render, then review</h2></div><span className={projectSaved ? "video-save-state is-saved" : "video-save-state"}>{projectSaved ? "Timeline saved" : "Unsaved changes"}</span></div>
      {!rendererReady ? <div className="video-renderer-warning"><div><strong>Renderer not connected</strong><span>Your last Render click could not start a job because the GitHub Actions renderer token is missing.</span></div><a className="button" href="/admin/setup#video-renderer">Open Setup</a></div> : null}
      <div className="video-export-grid">{(Object.keys(VIDEO_FORMATS) as PathwayVideoFormat[]).map((key) => {
        const latest = latestByFormat.get(key);
        const rendering = busy === `render:${key}` || latest?.status === "queued" || latest?.status === "rendering";
        const localError = renderErrors[key];
        const renderPercent = renderProgressValue(latest);
        const renderStage = latest?.progress_stage || (latest ? renderStatusLabel(latest) : "Waiting");
        return <div className="video-export-option" key={key}>
          <div className="video-export-icon">{key === "youtube" ? <Youtube size={22}/> : <Film size={22}/>}</div>
          <div><strong>{formatLabel(key)}</strong><p>{VIDEO_FORMATS[key].purpose}</p>{latest ? <small className={`render-status is-${latest.status}`}>{renderStatusLabel(latest)}{latest.error ? ` · ${latest.error}` : ""}</small> : <small>No render yet</small>}
            {rendering ? <div className="video-render-progress" aria-label={`${renderStage} ${renderPercent}%`}><div className="video-render-progress-copy"><span>{renderStage}</span><strong>{renderPercent}%</strong></div><div className="video-render-progress-track"><i style={{ width: `${renderPercent}%` }}/></div></div> : null}
          </div>
          {latest?.status === "completed" && latest.output_url ? <div className="video-render-actions"><button type="button" className="button primary" onClick={() => setReviewRenderId(latest.id)}><Play size={15}/> Watch</button><a className="button" href={latest.output_url} target="_blank" rel="noreferrer"><Download size={15}/> Download</a></div> : <button type="button" className="button" disabled={!databaseReady || !rendererReady || !selected.audioUrl || rendering || busy === "analyze"} onClick={() => void requestRender(key)}>{rendering ? <Loader2 className="spin" size={15}/> : <RefreshCw size={15}/>} {latest ? "Render again" : "Render"}</button>}
          {localError ? <div className="video-render-inline-error">{localError}{!rendererReady ? <> <a href="/admin/setup#video-renderer">Fix in Setup</a></> : null}</div> : null}
        </div>;
      })}</div>
      <div className="video-distribution-note"><strong>Nothing publishes from here</strong><p>Render creates the final MP4 only. When it is finished, the exact file appears in Final render review below. You can watch it, scrub it, use full screen, and download it before Channel Publishing ever receives it.</p></div>
    </section>

    <section className="admin-card video-review-card">
      <div className="video-card-heading"><div><span className="section-kicker">Quality control</span><h2>Final render review</h2></div>{reviewRender ? <span className="video-review-ready">Ready to review</span> : <span>Waiting for render</span>}</div>
      {reviewRender?.output_url ? <>
        <div className={`video-final-player is-${reviewRender.format}`}>
          <video key={reviewRender.id} controls playsInline preload="metadata" src={reviewRender.output_url}/>
        </div>
        <div className="video-review-controls">
          <div><strong>{selected.title} · {formatLabel(reviewRender.format)}</strong><span>This is the actual rendered MP4, not the browser mockup.{reviewRender.completed_at ? ` Finished ${new Date(reviewRender.completed_at).toLocaleString()}.` : ""}</span></div>
          <div className="video-review-actions"><a className="button" href={reviewRender.output_url} target="_blank" rel="noreferrer"><Download size={15}/> Download MP4</a></div>
        </div>
        {readyRenders.length > 1 ? <div className="video-review-versions">{readyRenders.map((render) => <button type="button" key={render.id} className={reviewRender.id === render.id ? "is-active" : ""} onClick={() => setReviewRenderId(render.id)}><strong>{formatLabel(render.format)}</strong><span>{render.completed_at ? new Date(render.completed_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "Ready"}</span></button>)}</div> : null}
      </> : <div className="video-review-empty"><Film size={28}/><div><strong>No finished video yet</strong><p>Once a render reaches Ready, the MP4 player will appear here automatically. You will be able to watch the entire export in-app before posting anywhere.</p></div></div>}
    </section>

    <PathwayVideoPublishingKit slug={selected.slug} title={selected.title}/>
  </div>;
}
