"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Film, Loader2, Play, RefreshCw, Save, Sparkles, TimerReset, Youtube } from "lucide-react";
import {
  activePathwayVideoCue,
  buildEstimatedPathwayVideoTimeline,
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
  project: {
    id: string;
    audioContentHash: string | null;
    timeline: PathwayVideoCue[] | null;
    style: Record<string, unknown>;
    updatedAt: string;
  } | null;
  renders: RenderRow[];
};

function formatLabel(format: PathwayVideoFormat) {
  if (format === "youtube") return "YouTube 16:9";
  if (format === "vertical") return "Reel / TikTok 9:16";
  return "Square 1:1";
}

function renderStatusLabel(render: RenderRow) {
  if (render.status === "queued") return "Queued";
  if (render.status === "rendering") return "Rendering";
  if (render.status === "completed") return "Ready";
  return "Failed";
}

export function PathwayVideoStudio({ pathways, databaseReady }: { pathways: StudioPathway[]; databaseReady: boolean }) {
  const available = pathways.filter((pathway) => pathway.audioUrl);
  const [selectedSlug, setSelectedSlug] = useState(available[0]?.slug ?? pathways[0]?.slug ?? "");
  const selected = pathways.find((pathway) => pathway.slug === selectedSlug) ?? pathways[0];
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [format, setFormat] = useState<PathwayVideoFormat>("youtube");
  const [timeline, setTimeline] = useState<PathwayVideoCue[]>([]);
  const [selectedCueId, setSelectedCueId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [renders, setRenders] = useState<RenderRow[]>(selected?.renders ?? []);
  const [projectSaved, setProjectSaved] = useState(Boolean(selected?.project));

  useEffect(() => {
    setDuration(0);
    setCurrentTime(0);
    setMessage("");
    setRenders(selected?.renders ?? []);
    setProjectSaved(Boolean(selected?.project));
    const saved = selected?.project?.timeline;
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
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/admin/video-studio/renders?slug=${encodeURIComponent(selected.slug)}`, { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (response.ok && Array.isArray(data.renders)) setRenders(data.renders);
      } catch { /* next poll will retry */ }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [renders, selected?.slug]);

  const activeCue = useMemo(() => activePathwayVideoCue(timeline, currentTime), [timeline, currentTime]);
  const selectedCue = timeline.find((cue) => cue.id === selectedCueId) ?? activeCue;
  const ratio = VIDEO_FORMATS[format];
  const progress = duration ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;
  const latestByFormat = useMemo(() => {
    const result = new Map<PathwayVideoFormat, RenderRow>();
    for (const render of renders) if (!result.has(render.format)) result.set(render.format, render);
    return result;
  }, [renders]);

  function rebuildTimeline() {
    if (!selected) return;
    const estimatedDuration = duration || selected.estimatedMinutes * 60;
    const next = buildEstimatedPathwayVideoTimeline(selected, estimatedDuration);
    setTimeline(next);
    setSelectedCueId(next[0]?.id ?? null);
    setProjectSaved(false);
    setMessage("Timeline rebuilt from the live Pathway steps. Set Scripture cues against the playhead before final rendering.");
  }

  function updateCue(id: string, patch: Partial<PathwayVideoCue>) {
    setTimeline((current) => current.map((cue) => cue.id === id ? { ...cue, ...patch } : cue));
    setProjectSaved(false);
  }

  function setCueAtPlayhead(id: string) {
    updateCue(id, { start: Number(currentTime.toFixed(2)) });
    setTimeline((current) => normalizePathwayVideoTimeline(current.map((cue) => cue.id === id ? { ...cue, start: Number(currentTime.toFixed(2)) } : cue), duration || Number.MAX_SAFE_INTEGER));
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
        body: JSON.stringify({ slug: selected.slug, timeline: normalized, style: { brandVersion: 1 } })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Video project could not be saved.");
      setTimeline(normalized);
      setProjectSaved(true);
      if (!silent) setMessage("Video timeline saved.");
      return data.project as { id: string };
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Video project could not be saved.");
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function requestRender(targetFormat: PathwayVideoFormat) {
    if (!selected?.audioUrl) return;
    setBusy(`render:${targetFormat}`);
    setMessage("");
    try {
      const project = projectSaved ? { id: selected.project?.id ?? "saved" } : await saveProject(true);
      if (!project) throw new Error("Save the video timeline before rendering.");
      const response = await fetch("/api/admin/video-studio/render", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug: selected.slug, formats: [targetFormat] })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Render could not be queued.");
      if (Array.isArray(data.renders)) setRenders((current) => [...data.renders, ...current]);
      setMessage(`${formatLabel(targetFormat)} render queued. You can leave this page; the renderer runs independently.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Render could not be queued.");
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
        <p className="admin-lede">Turn approved Pathway audio into branded YouTube episodes and vertical social videos. The video timeline stays attached to the same Pathway and audio revision.</p>
      </div>
      <div className="video-studio-heading-actions">
        <button type="button" className="button" onClick={rebuildTimeline}><Sparkles size={16}/> Auto-build timeline</button>
        <button type="button" className="button primary" disabled={!databaseReady || busy === "save"} onClick={() => void saveProject()}>{busy === "save" ? <Loader2 className="spin" size={16}/> : <Save size={16}/>} Save</button>
      </div>
    </div>

    {!databaseReady ? <div className="admin-notice"><strong>Video Studio database migration is not applied yet.</strong> Previewing works now. Saving and rendering become active after the new Pathway video migration is applied.</div> : null}
    {message ? <div className="admin-notice">{message}</div> : null}

    <section className="video-studio-sourcebar admin-card">
      <label><span>Pathway source</span><select value={selected.slug} onChange={(event) => setSelectedSlug(event.target.value)}>{pathways.map((pathway) => <option key={pathway.slug} value={pathway.slug}>{pathway.title}{pathway.audioUrl ? "" : " · no audio"}</option>)}</select></label>
      <div className="video-source-status"><span className={selected.audioUrl ? "status-dot is-ready" : "status-dot"}/><div><strong>{selected.audioUrl ? "Audio ready" : "Audio missing"}</strong><small>{selected.audioGeneratedAt ? `Generated ${new Date(selected.audioGeneratedAt).toLocaleString()}` : "Generate the Pathway audio first."}</small></div></div>
      <div className="video-source-status"><span className={selected.scriptApproved ? "status-dot is-ready" : "status-dot"}/><div><strong>{selected.scriptApproved ? "Script approved" : "Script not approved"}</strong><small>{selected.steps.length} Scripture stops in the live Pathway</small></div></div>
    </section>

    <div className="video-studio-grid">
      <section className="admin-card video-preview-card">
        <div className="video-card-heading"><div><span className="section-kicker">Live preview</span><h2>{selected.title}</h2></div><span>{ratio.width} × {ratio.height}</span></div>

        <div className={`pathway-video-preview is-${format} ${activeCue?.kind === "brand" ? "is-brand-cue" : ""}`} style={{ aspectRatio: `${ratio.width}/${ratio.height}` }}>
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
          <div className="video-preview-footer"><div><strong>{activeCue?.reference || "APOSTOLIC GUIDE"}</strong><span>{formatVideoTimestamp(currentTime)}</span></div><span>{formatVideoTimestamp(duration)}</span></div>
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
        <div className="video-card-heading"><div><span className="section-kicker">Timeline</span><h2>Scripture cues</h2></div><button type="button" className="button small" onClick={rebuildTimeline}><TimerReset size={15}/> Reset</button></div>
        <p className="video-timeline-help">Auto-build gives you a clean starting point. Play the audio and use <strong>Set here</strong> when each Scripture section begins. That timing is reused for every output format.</p>
        <div className="video-cue-list">{timeline.map((cue, index) => <article key={cue.id} className={selectedCue?.id === cue.id ? "video-cue is-selected" : "video-cue"} onClick={() => setSelectedCueId(cue.id)}>
          <div className="video-cue-index"><span>{String(index + 1).padStart(2, "0")}</span><strong>{formatVideoTimestamp(cue.start)}</strong></div>
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
      <div className="video-card-heading"><div><span className="section-kicker">Render queue</span><h2>Export once, publish anywhere</h2></div><span className={projectSaved ? "video-save-state is-saved" : "video-save-state"}>{projectSaved ? "Timeline saved" : "Unsaved changes"}</span></div>
      <div className="video-export-grid">{(Object.keys(VIDEO_FORMATS) as PathwayVideoFormat[]).map((key) => {
        const latest = latestByFormat.get(key);
        const rendering = busy === `render:${key}` || latest?.status === "queued" || latest?.status === "rendering";
        return <div className="video-export-option" key={key}>
          <div className="video-export-icon">{key === "youtube" ? <Youtube size={22}/> : <Film size={22}/>}</div>
          <div><strong>{formatLabel(key)}</strong><p>{VIDEO_FORMATS[key].purpose}</p>{latest ? <small className={`render-status is-${latest.status}`}>{renderStatusLabel(latest)}{latest.error ? ` · ${latest.error}` : ""}</small> : <small>No render yet</small>}</div>
          {latest?.status === "completed" && latest.output_url ? <a className="button" href={latest.output_url} target="_blank" rel="noreferrer"><Download size={15}/> Download</a> : <button type="button" className="button" disabled={!databaseReady || !selected.audioUrl || rendering} onClick={() => void requestRender(key)}>{rendering ? <Loader2 className="spin" size={15}/> : <RefreshCw size={15}/>} {latest ? "Render again" : "Render"}</button>}
        </div>;
      })}</div>
      <div className="video-distribution-note"><strong>Publishing adapters</strong><p>The render layer is intentionally separate from channel credentials. Once YouTube, Instagram publishing, and TikTok are connected, these finished renders can move straight into a publish queue without rebuilding the video.</p></div>
    </section>
  </div>;
}
