"use client";

import { ArrowLeft, ArrowRight, CalendarDays, Check, Clock3, Eye, ExternalLink, Heart, Instagram, Layers3, Loader2, MessageCircle, Play, RefreshCw, Send, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type ProjectSummary = { id: string; title: string; pathway_slug: string; intent: string; format: "single" | "carousel" | "story"; frame_count: number; status: string; updated_at?: string };
type Publication = {
  id: string;
  pathway_slug: string;
  platform: string;
  status: string;
  external_post_id?: string | null;
  published_url?: string | null;
  scheduled_for?: string | null;
  published_at?: string | null;
  error_message?: string | null;
  creative_project_id: string;
  publication_mode: string;
  manual_finish_reason?: string | null;
  attempt_count: number;
  created_at: string;
  updated_at: string;
  project?: ProjectSummary | ProjectSummary[] | null;
};
type ProjectBundle = {
  project: {
    id: string;
    title: string;
    pathwayTitle: string;
    pathwaySlug: string;
    intent: string;
    format: "single" | "carousel" | "story";
    frameCount: number;
    status: string;
    unifiedCaption: string;
    editorState: { frames: Array<{ id: string; order: number; headline: string; caption: string }> };
  };
  assets: Array<{ frame_id?: string | null; role: string; sort_order: number; asset?: { id: string; title: string; public_url?: string | null; preview_url?: string | null; metadata?: Record<string, unknown> } | null }>;
};
type Dashboard = { projects: ProjectSummary[]; readyProjects: ProjectSummary[]; publications: Publication[]; counts: Record<string, number> };
type Mode = "publish_now" | "schedule" | "next_available" | "finish_manually";
type Step = "select" | "preview" | "publish";
type ActivityView = "queue" | "history";

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store", headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data;
}

function projectForPublication(publication: Publication): ProjectSummary | null {
  if (Array.isArray(publication.project)) return publication.project[0] ?? null;
  return publication.project ?? null;
}

function formatLabel(format: string) {
  return format === "single" ? "Single post" : format === "story" ? "Story" : "Carousel";
}

function statusLabel(status: string) {
  return status.replaceAll("_", " ").replace(/\b\w/g, (value) => value.toUpperCase());
}

function localInputValue(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function assetUrl(link: ProjectBundle["assets"][number] | undefined) {
  return link?.asset?.preview_url || link?.asset?.public_url || null;
}

export function CreativePublishingClient({ initialProjectId }: { initialProjectId?: string | null }) {
  const router = useRouter();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [bundle, setBundle] = useState<ProjectBundle | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState(initialProjectId ?? "");
  const [step, setStep] = useState<Step>(initialProjectId ? "preview" : "select");
  const [activityView, setActivityView] = useState<ActivityView>("queue");
  const [mode, setMode] = useState<Mode>("schedule");
  const [scheduleLocal, setScheduleLocal] = useState(localInputValue(new Date(Date.now() + 60 * 60_000)));
  const [manualReason, setManualReason] = useState("Finish in Instagram for native-only controls or final interactive elements.");
  const [caption, setCaption] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const data = await jsonRequest<Dashboard>("/api/admin/creative-publications");
      setDashboard(data);
      if (!selectedProjectId && data.readyProjects[0]?.id) setSelectedProjectId(data.readyProjects[0].id);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Publishing could not be loaded.");
    } finally { setLoading(false); }
  }, [selectedProjectId]);

  useEffect(() => { void loadDashboard(); }, [loadDashboard]);

  useEffect(() => {
    if (!selectedProjectId) { setBundle(null); return; }
    let cancelled = false;
    jsonRequest<ProjectBundle>(`/api/admin/creative-projects/${selectedProjectId}`)
      .then((data) => {
        if (cancelled) return;
        setBundle(data);
        setCaption(data.project.unifiedCaption || "");
      })
      .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Creative Project could not be loaded."); });
    return () => { cancelled = true; };
  }, [selectedProjectId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("view", "creative");
    if (selectedProjectId) url.searchParams.set("projectId", selectedProjectId);
    else url.searchParams.delete("projectId");
    window.history.replaceState(window.history.state, "", `${url.pathname}?${url.searchParams.toString()}`);
  }, [selectedProjectId]);

  const activePublications = useMemo(() => (dashboard?.publications ?? []).filter((item) => ["scheduled", "publishing", "needs_manual_finish"].includes(item.status)), [dashboard]);
  const history = useMemo(() => (dashboard?.publications ?? []).filter((item) => ["published", "failed", "cancelled"].includes(item.status)), [dashboard]);
  const eligibleProjects = useMemo(() => (dashboard?.projects ?? []).filter((project) => ["ready", "published", "failed", "needs_manual_finish"].includes(project.status)), [dashboard]);

  const renderAssets = useMemo(() => {
    if (!bundle) return [];
    return bundle.assets
      .filter((link) => ["cover", "render"].includes(link.role) && Boolean(assetUrl(link)))
      .sort((a, b) => a.sort_order - b.sort_order)
      .reduce<Array<typeof bundle.assets[number]>>((acc, link) => {
        if (!acc.some((existing) => existing.frame_id === link.frame_id)) acc.push(link);
        return acc;
      }, []);
  }, [bundle]);

  async function schedulePublication() {
    if (!bundle) return;
    setWorking("publish");
    setError("");
    setNotice("");
    try {
      const payload: Record<string, unknown> = {
        projectId: bundle.project.id,
        platform: "instagram",
        mode,
        caption,
        timezoneOffsetMinutes: new Date().getTimezoneOffset()
      };
      if (mode === "schedule") payload.scheduledFor = new Date(scheduleLocal).toISOString();
      if (mode === "finish_manually") {
        payload.manualFinishReason = manualReason;
        if (scheduleLocal) payload.scheduledFor = new Date(scheduleLocal).toISOString();
      }
      await jsonRequest<{ publication: Publication }>("/api/admin/creative-publications", { method: "POST", body: JSON.stringify(payload) });
      setNotice(mode === "publish_now" ? "Published to Instagram." : mode === "finish_manually" ? "Added to the manual-finish queue." : "Added to the publishing calendar.");
      await loadDashboard();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Publication could not be created.");
    } finally { setWorking(""); }
  }

  async function retry(publicationId: string) {
    setWorking(`retry-${publicationId}`);
    try {
      await jsonRequest(`/api/admin/creative-publications/${publicationId}/retry`, { method: "POST", body: "{}" });
      setNotice("Retry completed.");
      await loadDashboard();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Retry failed."); }
    finally { setWorking(""); }
  }

  async function finishManual(publicationId: string) {
    setWorking(`manual-${publicationId}`);
    try {
      await jsonRequest(`/api/admin/creative-publications/${publicationId}/manual-finish`, { method: "POST", body: JSON.stringify({}) });
      setNotice("Manual publication marked Published.");
      await loadDashboard();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Manual publication could not be completed."); }
    finally { setWorking(""); }
  }

  function chooseProject(value: string) {
    setSelectedProjectId(value);
    setNotice("");
    setStep(value ? "preview" : "select");
  }

  const firstAsset = assetUrl(renderAssets[0]);
  const destinationLabel = bundle?.project.format === "story" ? "Instagram Story" : "Instagram Feed";

  return <section className="creative-publishing-shell creative-guided-publishing">
    <div className="creative-page-head">
      <div><span className="creative-kicker">Distribution · Publishing</span><h1>Preview it. Then publish it.</h1><p>Ready posts are saved here. Reload, leave Safari, or come back later and the same project can be reopened with fresh media previews.</p></div>
      <button type="button" className="creative-secondary" onClick={() => router.push("/admin/creative-library")}><Layers3 size={16}/> Creative Library</button>
    </div>

    {error ? <div className="creative-error-banner"><TriangleAlert size={16}/>{error}</div> : null}
    {notice ? <div className="creative-success-banner"><Check size={16}/>{notice}</div> : null}

    <nav className="creative-publish-flow" aria-label="Creative publishing steps">
      <button type="button" className={step === "select" ? "is-active" : ""} onClick={() => setStep("select")}><span>1</span><div><strong>Ready</strong><small>Saved for publishing</small></div></button>
      <button type="button" disabled={!bundle} className={step === "preview" ? "is-active" : ""} onClick={() => setStep("preview")}><span>2</span><div><strong>Preview</strong><small>See what goes out</small></div></button>
      <button type="button" disabled={!bundle || !renderAssets.length} className={step === "publish" ? "is-active" : ""} onClick={() => setStep("publish")}><span>3</span><div><strong>Publish</strong><small>Choose when</small></div></button>
    </nav>

    <section className="creative-card creative-guided-card" data-step={step}>
      {step === "select" ? <div className="creative-guided-select">
        <div className="creative-guided-heading"><div><span className="creative-kicker">Ready for Publish</span><h2>Saved publishing drafts.</h2><p>These are finished Creative Projects waiting for a publishing decision. They stay here until you schedule, publish, or move them back to editing.</p></div><Layers3 size={22}/></div>
        <label>Ready for Publish<select value={selectedProjectId} onChange={(event) => chooseProject(event.target.value)}><option value="">Select a saved project</option>{eligibleProjects.map((project) => <option value={project.id} key={project.id}>{project.title} · {formatLabel(project.format)}</option>)}</select></label>
        {loading ? <div className="creative-empty compact"><Loader2 className="spin" size={18}/> Loading saved posts…</div> : null}
        {!loading && dashboard?.readyProjects.length ? <div className="creative-ready-picks">{dashboard.readyProjects.slice(0, 8).map((project) => <button type="button" key={project.id} onClick={() => chooseProject(project.id)}><div><strong>{project.title}</strong><small>Ready for Publish · {formatLabel(project.format)}{project.format !== "single" ? ` · ${project.frame_count} frames` : ""}</small></div><ArrowRight size={15}/></button>)}</div> : null}
        {!loading && !dashboard?.readyProjects.length ? <div className="creative-empty compact"><Send size={19}/> Nothing is waiting in Ready for Publish.</div> : null}
      </div> : null}

      {step === "preview" && bundle ? <div className="creative-guided-preview">
        <div className="creative-guided-heading"><div><span className="creative-kicker">Step 2 · Preview</span><h2>This is what is going out.</h2><p><strong>{destinationLabel}</strong> · <span>@apostolicguide</span> · {formatLabel(bundle.project.format)}</p></div><Eye size={22}/></div>

        <div className="creative-preview-layout">
          <div className={`creative-instagram-preview is-${bundle.project.format}`}>
            <div className="creative-instagram-preview-head"><span className="creative-instagram-avatar">AG</span><div><strong>apostolicguide</strong><small>{destinationLabel}</small></div><Instagram size={18}/></div>
            <div className="creative-instagram-preview-media">
              {firstAsset ? <img src={firstAsset} alt={renderAssets[0]?.asset?.title || bundle.project.title}/> : <div className="creative-publisher-no-render">No current render. Return to Carousel Studio and mark the project Ready again.</div>}
              {renderAssets.length > 1 ? <span className="creative-preview-count">1 / {renderAssets.length}</span> : null}
            </div>
            <div className="creative-instagram-preview-actions"><Heart size={19}/><MessageCircle size={19}/><Send size={18}/></div>
            <p className="creative-instagram-preview-caption"><strong>apostolicguide</strong> {caption || "No caption yet."}</p>
          </div>

          <div className="creative-preview-details">
            <div className="creative-destination-card"><Instagram size={20}/><div><span>Destination</span><strong>{destinationLabel}</strong><small>@apostolicguide</small></div><Check size={17}/></div>
            <div className="creative-preview-project"><span>Saved project</span><strong>{bundle.project.title}</strong><small>{bundle.project.pathwayTitle} · {formatLabel(bundle.project.format)}{bundle.project.format !== "single" ? ` · ${bundle.project.frameCount} frames` : ""}</small></div>
            {renderAssets.length > 1 ? <div className="creative-preview-strip">{renderAssets.map((link, index) => { const url = assetUrl(link); return url ? <img key={link.asset?.id || index} src={url} alt={link.asset?.title || `Frame ${index + 1}`}/> : null; })}</div> : null}
            <label>Caption going out<textarea rows={6} value={caption} onChange={(event) => setCaption(event.target.value)}/></label>
            <button type="button" className="creative-primary creative-preview-continue" disabled={!renderAssets.length} onClick={() => setStep("publish")}><Send size={16}/> Continue to Publish <ArrowRight size={15}/></button>
          </div>
        </div>
      </div> : null}

      {step === "publish" && bundle ? <div className="creative-guided-publish">
        <div className="creative-guided-heading"><div><span className="creative-kicker">Step 3 · Publish</span><h2>Send this post.</h2><p>The post and destination are locked in. Only choose when it goes out.</p></div><Send size={22}/></div>

        <div className="creative-publish-summary">
          <div className="creative-publish-thumb">{firstAsset ? <img src={firstAsset} alt=""/> : <Instagram size={22}/>}</div>
          <div><span>{destinationLabel}</span><strong>{bundle.project.title}</strong><small>@apostolicguide · {formatLabel(bundle.project.format)}</small></div>
          <button type="button" className="creative-secondary" onClick={() => setStep("preview")}><Eye size={14}/> Preview</button>
        </div>

        <div className="creative-publishing-modes creative-guided-modes">
          <button type="button" className={mode === "publish_now" ? "is-active" : ""} onClick={() => setMode("publish_now")}><Play size={15}/><span>Publish Now</span></button>
          <button type="button" className={mode === "schedule" ? "is-active" : ""} onClick={() => setMode("schedule")}><Clock3 size={15}/><span>Schedule</span></button>
          <button type="button" className={mode === "next_available" ? "is-active" : ""} onClick={() => setMode("next_available")}><CalendarDays size={15}/><span>Next Available</span></button>
          <button type="button" className={mode === "finish_manually" ? "is-active" : ""} onClick={() => setMode("finish_manually")}><Instagram size={15}/><span>Finish in Instagram</span></button>
        </div>
        {mode === "schedule" || mode === "finish_manually" ? <label>{mode === "finish_manually" ? "Reminder time" : "Schedule time"}<input type="datetime-local" value={scheduleLocal} onChange={(event) => setScheduleLocal(event.target.value)}/></label> : null}
        {mode === "finish_manually" ? <label>Manual finish note<textarea rows={2} value={manualReason} onChange={(event) => setManualReason(event.target.value)}/></label> : null}

        <div className="creative-final-actions">
          <button type="button" className="creative-secondary" onClick={() => setStep("preview")}><ArrowLeft size={15}/> Back to Preview</button>
          <button type="button" className="creative-primary creative-publish-button" disabled={Boolean(working) || !renderAssets.length} onClick={() => void schedulePublication()}>{working === "publish" ? <Loader2 size={16} className="spin"/> : <Send size={16}/>} {mode === "publish_now" ? "Publish to Instagram" : mode === "schedule" ? "Schedule on Instagram" : mode === "next_available" ? "Add to Next Publishing Slot" : "Send to Instagram Finish Queue"}</button>
        </div>
      </div> : null}
    </section>

    <details className="creative-publishing-activity">
      <summary><span>Publishing activity</span><small>{activePublications.length} active · {history.length} completed</small></summary>
      <div className="creative-publishing-board">
        <div className="creative-tabs"><button type="button" className={activityView === "queue" ? "is-active" : ""} onClick={() => setActivityView("queue")}>Queue</button><button type="button" className={activityView === "history" ? "is-active" : ""} onClick={() => setActivityView("history")}>History</button></div>
        {activityView === "queue" ? <div className="creative-queue-list">{activePublications.length ? activePublications.map((publication, index) => {
          const source = projectForPublication(publication);
          return <div className="creative-publication-row" key={publication.id}><span className="creative-queue-number">{index + 1}</span><div><strong>{source?.title || publication.pathway_slug}</strong><small>{source ? formatLabel(source.format) : publication.platform}</small></div><div className="creative-pub-time">{publication.scheduled_for ? new Date(publication.scheduled_for).toLocaleString() : statusLabel(publication.status)}</div><i className={`creative-status is-${publication.status}`}>{statusLabel(publication.status)}</i>{publication.status === "needs_manual_finish" ? <button type="button" className="creative-secondary" disabled={working === `manual-${publication.id}`} onClick={() => void finishManual(publication.id)}><Check size={13}/> Mark finished</button> : null}</div>;
        }) : <p className="creative-muted">Nothing is waiting in the queue.</p>}</div> : null}
        {activityView === "history" ? <div className="creative-history-list">{history.length ? history.map((publication) => { const source = projectForPublication(publication); return <div className="creative-history-row" key={publication.id}><div className={`creative-history-icon is-${publication.status}`}>{publication.status === "failed" ? <TriangleAlert size={17}/> : <Check size={17}/>}</div><div><strong>{source?.title || publication.pathway_slug}</strong><small>{formatLabel(source?.format || "single")} · {publication.platform} · {publication.published_at ? new Date(publication.published_at).toLocaleString() : new Date(publication.updated_at).toLocaleString()}</small>{publication.error_message ? <p>{publication.error_message}</p> : null}</div><i className={`creative-status is-${publication.status}`}>{statusLabel(publication.status)}</i><div className="creative-inline-actions">{publication.status === "failed" ? <button type="button" disabled={Boolean(working)} onClick={() => void retry(publication.id)}><RefreshCw size={13}/> Retry</button> : null}{publication.published_url ? <a href={publication.published_url} target="_blank" rel="noreferrer"><ExternalLink size={13}/> Open</a> : null}</div></div>; }) : <div className="creative-empty compact">No publication history yet.</div>}</div> : null}
      </div>
    </details>
  </section>;
}
