"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Film, Loader2, Plus, RefreshCw, Smartphone, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "./video-producer-library.module.css";
import { VideoProducerSectionNav } from "./video-producer-section-nav";

type ReelRender = {
  id: string;
  status: "queued" | "rendering" | "completed" | "failed";
  progress?: { percent?: number; stage?: string } | null;
  error?: string | null;
  output_storage_path?: string | null;
};

type Project = {
  id: string;
  title: string;
  mode: "podcast" | "reels";
  status: string;
  parent_project_id: string | null;
  pathway_slug?: string | null;
  source_duration?: number | null;
  source_range_start?: number | null;
  source_range_end?: number | null;
  approval_fingerprint?: string | null;
  latest_render?: ReelRender | null;
};

type ReelFilter = "all" | "podcast" | "standalone" | "attention";

function seconds(project: Project) {
  if (project.source_range_start != null && project.source_range_end != null) return Math.max(0, project.source_range_end - project.source_range_start);
  return Math.max(0, Number(project.source_duration || 0));
}

function duration(project: Project) {
  const total = Math.round(seconds(project));
  if (!total) return "—";
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, "0")}`;
}

function statusLabel(project: Project) {
  const render = project.latest_render;
  if (render?.status === "failed") return "Render failed";
  if (render?.status === "rendering" || render?.status === "queued") return "Rendering";
  if (render?.status === "completed") return "Master ready";
  const labels: Record<string, string> = {
    uploaded: "Ready for Sol", directing: "Sol producing", planned: "Finish setup", approved: "Ready to render",
    rendering: "Rendering", review: "Master ready", completed: "Complete", failed: "Needs attention"
  };
  return labels[project.status] || project.status;
}

function statusState(project: Project) {
  if (project.status === "failed" || project.latest_render?.status === "failed") return "error";
  if (["directing", "rendering"].includes(project.status) || ["queued", "rendering"].includes(project.latest_render?.status || "")) return "working";
  if (["approved", "review", "completed"].includes(project.status) || project.latest_render?.status === "completed") return "ready";
  return "neutral";
}

function needsAttention(project: Project) {
  return project.status === "failed" || project.latest_render?.status === "failed";
}

function projectStep(project: Project) {
  if (["uploaded", "directing"].includes(project.status)) return "produce";
  if (project.status === "planned") return "finish";
  if (project.approval_fingerprint || ["approved", "rendering", "review", "completed"].includes(project.status)) return "deliver";
  return "produce";
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store", headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Reels library request failed.");
  return data as T;
}

async function loadLibrary() {
  const data = await requestJson<{ projects?: Project[] }>("/api/admin/video-producer/library");
  return (data.projects ?? []) as Project[];
}

export function VideoProducerReelsLibrary({ parentProjectId = null, embedded = false }: { parentProjectId?: string | null; embedded?: boolean }) {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<ReelFilter>("all");

  const load = useCallback(async () => {
    setLoading(true);
    try { setProjects(await loadLibrary()); setError(""); }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Reels library could not be loaded."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!projects.some((project) => project.mode === "reels" && (["directing", "rendering"].includes(project.status) || ["queued", "rendering"].includes(project.latest_render?.status || "")))) return;
    const timer = window.setInterval(() => void load(), 7000);
    return () => window.clearInterval(timer);
  }, [load, projects]);

  const projectMap = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
  const reels = useMemo(() => projects.filter((project) => project.mode === "reels" && (!parentProjectId || project.parent_project_id === parentProjectId)), [parentProjectId, projects]);
  const inherited = reels.filter((project) => Boolean(project.parent_project_id));
  const standalone = reels.filter((project) => !project.parent_project_id);
  const attention = reels.filter(needsAttention);
  const visible = useMemo(() => {
    if (filter === "podcast") return reels.filter((project) => Boolean(project.parent_project_id));
    if (filter === "standalone") return reels.filter((project) => !project.parent_project_id);
    if (filter === "attention") return reels.filter(needsAttention);
    return reels;
  }, [filter, reels]);

  async function trash(project: Project) {
    if (!window.confirm(`Move “${project.title}” to the Recovery Bucket? Nothing is permanently erased.`)) return;
    setDeleting(project.id); setError("");
    try {
      await requestJson(`/api/admin/video-producer/projects/${project.id}/trash`, { method: "POST", body: JSON.stringify({ action: "trash" }) });
      setProjects((current) => current.filter((item) => item.id !== project.id));
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Reel could not be moved to Recovery.");
    } finally {
      setDeleting(null);
    }
  }

  function row(project: Project) {
    const render = project.latest_render;
    const percent = render?.status === "completed" ? 100 : Math.max(0, Math.min(100, Number(render?.progress?.percent || 0)));
    const parent = project.parent_project_id ? projectMap.get(project.parent_project_id) : null;
    return (
      <div className={styles.row} key={project.id}>
        <span className={styles.rowIcon}><Smartphone size={17}/></span>
        <span className={styles.rowCopy}>
          <strong>{project.title}</strong>
          <span className={styles.rowMeta}><span className={styles.rowMetaText}>{duration(project)} · {parent ? `from ${parent.title}` : "standalone"}</span></span>
          <span className={styles.statusPill} data-state={statusState(project)}>{statusLabel(project)}</span>
          {render && ["queued", "rendering"].includes(render.status) ? <span className={styles.miniProgress}><i style={{ width: `${Math.max(percent, 3)}%` }}/></span> : null}
          {render?.error ? <span className={styles.rowError} title={render.error}>{render.error}</span> : null}
        </span>
        <span className={styles.rowActions}>
          {render?.status === "completed" ? <a className={styles.rowAction} href={`/api/admin/video-producer/projects/${project.id}/download`} target="_blank" rel="noopener noreferrer" aria-label={`Download ${project.title}`}><Download size={13}/></a> : null}
          <button type="button" className={styles.rowAction} onClick={() => router.push(`/admin/video-producer/${project.id}/${projectStep(project)}`)}>Open</button>
          <button type="button" className={`${styles.rowAction} ${styles.rowActionDanger}`} disabled={deleting === project.id} onClick={() => void trash(project)} aria-label={`Move ${project.title} to Recovery Bucket`} title="Move to Recovery Bucket">{deleting === project.id ? <Loader2 size={13} className={styles.spin}/> : <Trash2 size={13}/>}</button>
        </span>
      </div>
    );
  }

  if (embedded) return (
    <section className={styles.package} aria-label="Reels attached to this podcast">
      <div className={styles.packageHead}>
        <div>
          <div className={styles.packageTitle}><Smartphone size={16}/><h3>Reels package</h3><span className={styles.count}>{reels.length}</span></div>
          <p>Child Reels stay attached to this Podcast.</p>
        </div>
        <button type="button" className={styles.iconButton} onClick={() => void load()} disabled={loading} aria-label="Refresh reels">{loading ? <Loader2 size={14} className={styles.spin}/> : <RefreshCw size={14}/>}</button>
      </div>
      {error ? <div className={styles.error}>{error}</div> : null}
      {loading && !reels.length ? <div className={styles.empty}>Loading reels…</div> : reels.length ? <div className={styles.list}>{reels.map(row)}</div> : <div className={styles.empty}>No Reels from this Podcast yet.</div>}
      <div className={styles.packageFooter}><Link className={styles.utilityLink} href="/admin/video-producer/reels">Open full Reels Library</Link></div>
    </section>
  );

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.hero}>
          <div className={styles.heroCopy}><div className={styles.eyebrow}>Apostolic Guide Media</div><h1>Reels</h1><p>Standalone shorts and clips inherited from Podcast masters, in one queue.</p></div>
          <button type="button" className={styles.iconButton} onClick={() => void load()} disabled={loading} aria-label="Refresh reels">{loading ? <Loader2 size={18} className={styles.spin}/> : <RefreshCw size={18}/>}</button>
        </header>

        <VideoProducerSectionNav active="reels"/>

        <div className={styles.actionBar}>
          <div className={styles.primaryActions}><Link className={styles.primaryButton} href="/admin/video-producer/new?mode=reels"><Plus size={14}/><Smartphone size={14}/> Standalone Reel</Link></div>
          <Link className={styles.utilityLink} href="/admin/video-producer"><Film size={13}/> Projects</Link>
        </div>

        {error ? <div className={styles.error}>{error}</div> : null}

        <div className={styles.filterRail} aria-label="Filter Reels">
          <button type="button" data-active={filter === "all"} onClick={() => setFilter("all")}>All · {reels.length}</button>
          <button type="button" data-active={filter === "podcast"} onClick={() => setFilter("podcast")}>From podcasts · {inherited.length}</button>
          <button type="button" data-active={filter === "standalone"} onClick={() => setFilter("standalone")}>Standalone · {standalone.length}</button>
          <button type="button" data-active={filter === "attention"} onClick={() => setFilter("attention")}>Needs attention · {attention.length}</button>
        </div>

        <section className={styles.section}>
          <div className={styles.sectionHead}><div className={styles.sectionTitle}><h2>{filter === "all" ? "All Reels" : filter === "podcast" ? "From podcasts" : filter === "standalone" ? "Standalone" : "Needs attention"}</h2><span className={styles.count}>{visible.length}</span></div></div>
          {loading && !projects.length ? <div className={styles.empty}>Loading reels…</div> : visible.length ? <div className={styles.list}>{visible.map(row)}</div> : <div className={styles.empty}>Nothing in this view.</div>}
        </section>
      </div>
    </main>
  );
}
