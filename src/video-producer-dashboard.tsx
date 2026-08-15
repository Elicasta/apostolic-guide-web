"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArchiveRestore, Film, Images, Library, Loader2, Plus, RefreshCw, Smartphone, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "./video-producer-sequential.module.css";

type LibraryRender = {
  id: string;
  status: "queued" | "rendering" | "completed" | "failed";
  progress?: { percent?: number; stage?: string } | null;
};

type LibraryProject = {
  id: string;
  title: string;
  mode: "podcast" | "reels";
  status: string;
  parent_project_id: string | null;
  source_filename?: string | null;
  source_duration?: number | null;
  source_range_start?: number | null;
  source_range_end?: number | null;
  approval_fingerprint?: string | null;
  updated_at?: string | null;
  latest_render?: LibraryRender | null;
};

function duration(project: LibraryProject) {
  const seconds = project.source_range_start != null && project.source_range_end != null
    ? Math.max(0, project.source_range_end - project.source_range_start)
    : Math.max(0, Number(project.source_duration || 0));
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return total ? `${minutes}:${String(secs).padStart(2, "0")}` : "—";
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: "Needs source",
    uploading: "Uploading",
    uploaded: "Source ready",
    transcribing: "Transcribing",
    directing: "Sol producing",
    planned: "Finish setup",
    approved: "Ready to render",
    rendering: "Rendering",
    review: "Review master ready",
    completed: "Complete",
    failed: "Needs attention"
  };
  return labels[status] || status;
}

function projectStep(project: LibraryProject) {
  if (["draft", "uploading", "transcribing"].includes(project.status)) return "source";
  if (["uploaded", "directing"].includes(project.status)) return "produce";
  if (project.status === "planned") return "finish";
  if (["approved", "rendering", "review", "completed"].includes(project.status)) return "deliver";
  if (project.status === "failed" && project.approval_fingerprint) return "deliver";
  return project.source_filename ? "produce" : "source";
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store", headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data as T;
}

export function VideoProducerDashboard() {
  const router = useRouter();
  const [projects, setProjects] = useState<LibraryProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getJson<{ projects: LibraryProject[] }>("/api/admin/video-producer/library");
      setProjects(data.projects ?? []);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Projects could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!projects.some((project) => ["uploading", "transcribing", "directing", "rendering"].includes(project.status))) return;
    const timer = window.setInterval(() => void load(), 10000);
    return () => window.clearInterval(timer);
  }, [load, projects]);

  const roots = useMemo(() => projects.filter((project) => !project.parent_project_id), [projects]);
  const active = roots.filter((project) => project.status !== "completed");
  const done = roots.filter((project) => project.status === "completed");
  const reelCount = projects.filter((project) => project.mode === "reels").length;

  function open(project: LibraryProject) {
    router.push(`/admin/video-producer/${project.id}/${projectStep(project)}`);
  }

  async function trashProject(project: LibraryProject) {
    const includesReels = project.mode === "podcast" && projects.some((item) => item.parent_project_id === project.id);
    const message = includesReels
      ? `Move “${project.title}” and its attached Reels to the Recovery Bucket? Nothing is permanently erased.`
      : `Move “${project.title}” to the Recovery Bucket? Nothing is permanently erased.`;
    if (!window.confirm(message)) return;
    setDeleting(project.id); setError("");
    try {
      await getJson(`/api/admin/video-producer/projects/${project.id}/trash`, { method: "POST", body: JSON.stringify({ action: "trash" }) });
      setProjects((current) => current.filter((item) => item.id !== project.id && item.parent_project_id !== project.id));
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Project could not be moved to Recovery.");
    } finally {
      setDeleting(null);
    }
  }

  function projectRow(project: LibraryProject, complete = false) {
    const render = project.latest_render;
    const percent = render?.status === "completed" ? 100 : Math.max(0, Math.min(100, Number(render?.progress?.percent || 0)));
    return (
      <div className={styles.projectRow} key={project.id}>
        <button type="button" className={styles.projectRowMain} onClick={() => open(project)}>
          <span className={styles.projectIcon}>{project.mode === "podcast" ? <Film size={18}/> : <Smartphone size={18}/>}</span>
          <span className={styles.projectCopy}>
            <strong>{project.title}</strong>
            <small>{project.mode === "podcast" ? "Podcast" : "Reel"} · {duration(project)} · {complete ? "Complete" : statusLabel(project.status)}</small>
            {!complete && render && render.status !== "completed" ? <span className={styles.miniProgress}><i style={{ width: `${Math.max(percent, 3)}%` }}/></span> : null}
          </span>
          <span className={styles.continueLabel}>{complete ? "Open" : "Continue"}</span>
        </button>
        <button type="button" className={styles.trashAction} disabled={deleting === project.id} onClick={() => void trashProject(project)} aria-label={`Delete ${project.title}`} title="Move to Recovery Bucket">
          {deleting === project.id ? <Loader2 size={14} className={styles.spin}/> : <Trash2 size={14}/>} 
        </button>
      </div>
    );
  }

  return (
    <main className={styles.dashboard}>
      <div className={styles.dashboardShell}>
        <header className={styles.dashboardHeader}>
          <div>
            <div className={styles.eyebrow}>Apostolic Guide Media</div>
            <h1>Video Producer</h1>
            <p>Choose a project, finish one step, then move forward. No giant workspace.</p>
          </div>
          <button type="button" className={styles.iconAction} onClick={() => void load()} disabled={loading} aria-label="Refresh projects">
            {loading ? <Loader2 size={18} className={styles.spin}/> : <RefreshCw size={18}/>} 
          </button>
        </header>

        <section className={styles.newProjectRow} aria-label="Start or browse projects">
          <button type="button" onClick={() => router.push("/admin/video-producer/new?mode=podcast")}>
            <Film size={20}/><span><strong>New podcast</strong><small>Long-form · 16:9</small></span><Plus size={17}/>
          </button>
          <button type="button" onClick={() => router.push("/admin/video-producer/new?mode=reels")}>
            <Smartphone size={20}/><span><strong>New reel</strong><small>Standalone · 9:16</small></span><Plus size={17}/>
          </button>
          <button type="button" onClick={() => router.push("/admin/video-producer/reels")}>
            <Library size={20}/><span><strong>Reels library</strong><small>{reelCount} total · parent + standalone</small></span><Smartphone size={17}/>
          </button>
          <button type="button" onClick={() => router.push("/admin/video-producer/graphics")}>
            <Images size={20}/><span><strong>Graphics library</strong><small>Reusable PNG + WebP designs</small></span><Library size={17}/>
          </button>
        </section>

        <div className={styles.libraryUtilityRow}>
          <span />
          <Link className={styles.recoveryLink} href="/admin/video-producer/recovery"><ArchiveRestore size={14}/> Recovery Bucket</Link>
        </div>

        {error ? <div className={styles.error} style={{ marginTop: 14 }}>{error}</div> : null}

        <section className={styles.projectSection}>
          <div className={styles.sectionHeading}><h2>In production</h2><span>{active.length}</span></div>
          {loading && !roots.length ? <div className={styles.empty}>Loading projects…</div> : active.length ? <div className={styles.projectList}>{active.map((project) => projectRow(project))}</div> : <div className={styles.empty}>Nothing waiting on you.</div>}
        </section>

        {done.length ? (
          <section className={styles.projectSection}>
            <div className={styles.sectionHeading}><h2>Completed</h2><span>{done.length}</span></div>
            <div className={styles.projectList}>{done.slice(0, 12).map((project) => projectRow(project, true))}</div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
