"use client";

import { CalendarDays, Check, Clock3, ExternalLink, Instagram, Layers3, Loader2, Play, RefreshCw, Send, TriangleAlert } from "lucide-react";
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
  assets: Array<{ frame_id?: string | null; role: string; sort_order: number; asset?: { id: string; title: string; public_url?: string | null; metadata?: Record<string, unknown> } | null }>;
};
type Dashboard = { projects: ProjectSummary[]; readyProjects: ProjectSummary[]; publications: Publication[]; counts: Record<string, number> };
type Tab = "queue" | "calendar" | "history";
type Mode = "publish_now" | "schedule" | "next_available" | "finish_manually";

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
  return format === "single" ? "Single" : format === "story" ? "Story" : "Carousel";
}

function statusLabel(status: string) {
  return status.replaceAll("_", " ").replace(/\b\w/g, (value) => value.toUpperCase());
}

function localInputValue(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function CreativePublishingClient({ initialProjectId }: { initialProjectId?: string | null }) {
  const router = useRouter();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [bundle, setBundle] = useState<ProjectBundle | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState(initialProjectId ?? "");
  const [tab, setTab] = useState<Tab>("queue");
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

  const activePublications = useMemo(() => (dashboard?.publications ?? []).filter((item) => ["scheduled", "publishing", "needs_manual_finish"].includes(item.status)), [dashboard]);
  const history = useMemo(() => (dashboard?.publications ?? []).filter((item) => ["published", "failed", "cancelled"].includes(item.status)), [dashboard]);
  const calendarGroups = useMemo(() => {
    const groups = new Map<string, Publication[]>();
    for (const publication of dashboard?.publications ?? []) {
      const date = publication.scheduled_for || publication.published_at;
      if (!date) continue;
      const key = new Date(date).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
      const items = groups.get(key) ?? [];
      items.push(publication);
      groups.set(key, items);
    }
    return Array.from(groups.entries()).slice(0, 30);
  }, [dashboard]);

  const renderAssets = useMemo(() => {
    if (!bundle) return [];
    return bundle.assets
      .filter((link) => ["cover", "render"].includes(link.role) && link.asset?.public_url)
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
      const data = await jsonRequest<{ publication: Publication }>("/api/admin/creative-publications", { method: "POST", body: JSON.stringify(payload) });
      setNotice(mode === "publish_now" ? "Publication completed." : mode === "finish_manually" ? "Added to manual-finish queue." : "Publication scheduled.");
      await loadDashboard();
      if (mode !== "publish_now") setTab("queue");
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

  return <section className="creative-publishing-shell">
    <div className="creative-page-head">
      <div><span className="creative-kicker">Distribution · Publishing</span><h1>Creation ends before publishing begins.</h1><p>Choose a finished Creative Project, decide where and when it goes, then keep the attempt visible until it succeeds or is resolved.</p></div>
      <button type="button" className="creative-secondary" onClick={() => router.push("/admin/creative-library")}><Layers3 size={16}/> Creative Library</button>
    </div>

    <div className="creative-publishing-stats">
      <div><strong>{dashboard?.counts.draft ?? 0}</strong><span>Drafts</span></div>
      <div><strong>{dashboard?.counts.ready ?? 0}</strong><span>Ready</span></div>
      <div><strong>{dashboard?.counts.scheduled ?? 0}</strong><span>Scheduled</span></div>
      <div><strong>{dashboard?.counts.published ?? 0}</strong><span>Published</span></div>
      <div><strong>{dashboard?.counts.failed ?? 0}</strong><span>Failed</span></div>
    </div>

    {error ? <div className="creative-error-banner"><TriangleAlert size={16}/>{error}</div> : null}
    {notice ? <div className="creative-success-banner"><Check size={16}/>{notice}</div> : null}

    <div className="creative-publisher-grid">
      <section className="creative-card creative-publisher-composer">
        <div className="creative-panel-head"><div><strong>Publisher</strong><small>One engine. Format-aware controls.</small></div><Instagram size={18}/></div>
        <label>Creative Project<select value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)}><option value="">Select a Ready project</option>{dashboard?.projects.filter((project) => ["ready", "published", "failed", "needs_manual_finish"].includes(project.status)).map((project) => <option value={project.id} key={project.id}>{project.title} · {formatLabel(project.format)}</option>)}</select></label>
        {bundle ? <>
          <div className="creative-publisher-project"><div><strong>{bundle.project.title}</strong><span>{bundle.project.pathwayTitle}</span></div><span>{formatLabel(bundle.project.format)}{bundle.project.format !== "single" ? ` · ${bundle.project.frameCount}` : ""}</span></div>
          <div className={`creative-publisher-media is-${bundle.project.format}`}>{renderAssets.length ? renderAssets.map((link, index) => <div key={link.asset?.id || index}>{link.asset?.public_url ? <img src={link.asset.public_url} alt={link.asset.title || `Creative frame ${index + 1}`}/> : null}<span>{index + 1}</span></div>) : <div className="creative-publisher-no-render">No current renders. Return to Creative Studio and render this project first.</div>}</div>
          <label>Caption<textarea rows={7} value={caption} onChange={(event) => setCaption(event.target.value)}/></label>
          <div className="creative-publishing-modes">
            <button type="button" className={mode === "publish_now" ? "is-active" : ""} onClick={() => setMode("publish_now")}><Play size={15}/><span>{bundle.project.format === "story" ? "Auto Publish" : "Publish Now"}</span></button>
            <button type="button" className={mode === "schedule" ? "is-active" : ""} onClick={() => setMode("schedule")}><Clock3 size={15}/><span>Schedule</span></button>
            <button type="button" className={mode === "next_available" ? "is-active" : ""} onClick={() => setMode("next_available")}><CalendarDays size={15}/><span>Next Available Slot</span></button>
            <button type="button" className={mode === "finish_manually" ? "is-active" : ""} onClick={() => setMode("finish_manually")}><Instagram size={15}/><span>Finish Manually</span></button>
          </div>
          {mode === "schedule" || mode === "finish_manually" ? <label>{mode === "finish_manually" ? "Reminder time" : "Schedule time"}<input type="datetime-local" value={scheduleLocal} onChange={(event) => setScheduleLocal(event.target.value)}/></label> : null}
          {mode === "finish_manually" ? <label>Why manual?<textarea rows={2} value={manualReason} onChange={(event) => setManualReason(event.target.value)}/></label> : null}
          <button type="button" className="creative-primary creative-publish-button" disabled={Boolean(working) || !renderAssets.length} onClick={() => void schedulePublication()}>{working === "publish" ? <Loader2 size={16} className="spin"/> : <Send size={16}/>} {mode === "publish_now" ? "Publish" : mode === "schedule" ? `Schedule ${formatLabel(bundle.project.format)}` : mode === "next_available" ? "Add to Next Slot" : "Add Manual Finish"}</button>
        </> : <div className="creative-empty compact"><Send size={20}/><span>Select a Creative Project.</span></div>}
      </section>

      <section className="creative-card creative-publishing-board">
        <div className="creative-tabs"><button type="button" className={tab === "queue" ? "is-active" : ""} onClick={() => setTab("queue")}>Queue</button><button type="button" className={tab === "calendar" ? "is-active" : ""} onClick={() => setTab("calendar")}>Calendar</button><button type="button" className={tab === "history" ? "is-active" : ""} onClick={() => setTab("history")}>History</button></div>
        {loading ? <div className="creative-empty"><Loader2 className="spin"/> Loading publishing state...</div> : null}
        {!loading && tab === "queue" ? <div className="creative-queue-list">
          <div className="creative-list-section-title">UP NEXT</div>
          {activePublications.length ? activePublications.map((publication, index) => {
            const source = projectForPublication(publication);
            return <div className="creative-publication-row" key={publication.id}><span className="creative-queue-number">{index + 1}</span><div><strong>{source?.title || publication.pathway_slug}</strong><small>{source ? `${formatLabel(source.format)}${source.format !== "single" ? ` · ${source.frame_count}` : ""}` : publication.platform}</small></div><div className="creative-pub-time">{publication.scheduled_for ? new Date(publication.scheduled_for).toLocaleString() : statusLabel(publication.status)}</div><i className={`creative-status is-${publication.status}`}>{statusLabel(publication.status)}</i>{publication.status === "needs_manual_finish" ? <button type="button" className="creative-secondary" disabled={working === `manual-${publication.id}`} onClick={() => void finishManual(publication.id)}><Check size={13}/> Mark finished</button> : null}</div>;
          }) : <p className="creative-muted">Nothing scheduled yet.</p>}
          <div className="creative-list-section-title">READY, NOT SCHEDULED</div>
          {dashboard?.readyProjects.length ? dashboard.readyProjects.map((project, index) => <button type="button" className="creative-publication-row is-clickable" key={project.id} onClick={() => { setSelectedProjectId(project.id); window.scrollTo({ top: 0, behavior: "smooth" }); }}><span className="creative-queue-number">{index + 1}</span><div><strong>{project.title}</strong><small>{formatLabel(project.format)}{project.format !== "single" ? ` · ${project.frame_count}` : ""}</small></div><div className="creative-pub-time">Ready</div><i className="creative-status is-ready">Ready</i></button>) : <p className="creative-muted">No unscheduled Ready projects.</p>}
        </div> : null}
        {!loading && tab === "calendar" ? <div className="creative-calendar-list">{calendarGroups.length ? calendarGroups.map(([day, publications]) => <div className="creative-calendar-day" key={day}><strong>{day}</strong><div>{publications.map((publication) => { const source = projectForPublication(publication); const date = publication.scheduled_for || publication.published_at; return <div className="creative-calendar-item" key={publication.id}><time>{date ? new Date(date).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : ""}</time><div><strong>{source?.title || publication.pathway_slug}</strong><small>{source ? `${formatLabel(source.format)}${source.format !== "single" ? ` · ${source.frame_count}` : ""}` : publication.platform}</small></div><i className={`creative-status is-${publication.status}`}>{statusLabel(publication.status)}</i></div>; })}</div></div>) : <div className="creative-empty compact"><CalendarDays size={20}/> Nothing on the publishing calendar.</div>}</div> : null}
        {!loading && tab === "history" ? <div className="creative-history-list">{history.length ? history.map((publication) => { const source = projectForPublication(publication); return <div className="creative-history-row" key={publication.id}><div className={`creative-history-icon is-${publication.status}`}>{publication.status === "failed" ? <TriangleAlert size={17}/> : <Check size={17}/>}</div><div><strong>{source?.title || publication.pathway_slug}</strong><small>{formatLabel(source?.format || "single")} · {publication.platform} · {publication.published_at ? new Date(publication.published_at).toLocaleString() : new Date(publication.updated_at).toLocaleString()}</small>{publication.error_message ? <p>{publication.error_message}</p> : null}</div><i className={`creative-status is-${publication.status}`}>{statusLabel(publication.status)}</i><div className="creative-inline-actions">{publication.status === "failed" ? <button type="button" disabled={Boolean(working)} onClick={() => void retry(publication.id)}><RefreshCw size={13}/> Retry</button> : null}{publication.published_url ? <a href={publication.published_url} target="_blank" rel="noreferrer"><ExternalLink size={13}/> Open</a> : null}</div></div>; }) : <div className="creative-empty compact">No publication history yet.</div>}</div> : null}
      </section>
    </div>
  </section>;
}
