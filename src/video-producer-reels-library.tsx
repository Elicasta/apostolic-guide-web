"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Film, Loader2, RefreshCw, Smartphone, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "./video-producer-sequential.module.css";

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
      <div className={styles.projectRow} key={project.id}>
        <span className={styles.projectIcon}><Smartphone size={18}/></span>
        <span className={styles.projectCopy}>
          <strong>{project.title}</strong>
          <small>{duration(project)} · {statusLabel(project)}{parent ? ` · from ${parent.title}` : " · standalone"}</small>
          {render && ["queued", "rendering"].includes(render.status) ? <span className={styles.miniProgress}><i style={{ width: `${Math.max(percent, 3)}%` }}/></span> : null}
          {render?.error ? <small style={{ color: "#a63340", whiteSpace: "normal", marginTop: 3 }}>{render.error}</small> : null}
        </span>
        <span className={styles.rowActionGroup}>
          {render?.status === "completed" ? <a className={styles.smallAction} href={`/api/admin/video-producer/projects/${project.id}/download`} target="_blank" rel="noopener noreferrer" aria-label={`Download ${project.title}`}><Download size={13}/></a> : null}
          <button type="button" className={styles.smallAction} onClick={() => router.push(`/admin/video-producer/${project.id}/${projectStep(project)}`)}>Open</button>
          <button type="button" className={styles.trashAction} disabled={deleting === project.id} onClick={() => void trash(project)} aria-label={`Delete ${project.title}`} title="Move to Recovery Bucket">{deleting === project.id ? <Loader2 size={13} className={styles.spin}/> : <Trash2 size={13}/>}</button>
        </span>
      </div>
    );
  }

  const body = <>{error ? <div className={styles.error}>{error}</div> : null}{loading && !reels.length ? <div className={styles.empty}>Loading reels…</div> : reels.length ? <div className={styles.projectList}>{reels.map(row)}</div> : <div className={styles.empty}>{parentProjectId ? "No Reels have been created from this podcast yet." : "No Reels projects yet."}</div>}</>;

  if (embedded) return (
    <div className={styles.panel}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14 }}>
        <div><h3 className={styles.panelTitle}><Smartphone size={17}/> Reels package</h3><p className={styles.panelText}>Every child Reel stays attached to this podcast after you leave its editor.</p></div>
        <button type="button" className={styles.smallAction} onClick={() => void load()} disabled={loading} aria-label="Refresh reels">{loading ? <Loader2 size={13} className={styles.spin}/> : <RefreshCw size={13}/>}</button>
      </div>
      <div style={{ marginTop: 12 }}>{body}</div>
      <Link className={styles.backLink} style={{ marginTop: 12 }} href="/admin/video-producer/reels">Open full Reels Library</Link>
    </div>
  );

  return (
    <main className={styles.dashboard}>
      <div className={styles.dashboardShell}>
        <header className={styles.dashboardHeader}>
          <div><div className={styles.eyebrow}>Apostolic Guide Media</div><h1>Reels Library</h1><p>One home for standalone shorts and every Reel inherited from a Podcast master.</p></div>
          <button type="button" className={styles.iconAction} onClick={() => void load()} disabled={loading} aria-label="Refresh reels">{loading ? <Loader2 size={18} className={styles.spin}/> : <RefreshCw size={18}/>}</button>
        </header>
        <div className={styles.libraryUtilityRow}><Link className={styles.backLink} href="/admin/video-producer"><Film size={14}/> Video Producer</Link><Link className={styles.buttonSecondary} href="/admin/video-producer/new?mode=reels">New standalone Reel</Link></div>
        <section className={styles.projectSection}><div className={styles.sectionHeading}><h2>From podcasts</h2><span>{inherited.length}</span></div>{loading && !projects.length ? <div className={styles.empty}>Loading reels…</div> : inherited.length ? <div className={styles.projectList}>{inherited.map(row)}</div> : <div className={styles.empty}>No podcast Reels yet.</div>}</section>
        <section className={styles.projectSection}><div className={styles.sectionHeading}><h2>Standalone</h2><span>{standalone.length}</span></div>{standalone.length ? <div className={styles.projectList}>{standalone.map(row)}</div> : <div className={styles.empty}>No standalone Reels yet.</div>}</section>
      </div>
    </main>
  );
}
