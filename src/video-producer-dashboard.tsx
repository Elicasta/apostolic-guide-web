"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArchiveRestore, ChevronDown, Film, Loader2, Plus, RefreshCw, Smartphone, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "./video-producer-library.module.css";
import { VideoProducerSectionNav } from "./video-producer-section-nav";

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
    review: "Master ready",
    completed: "Complete",
    failed: "Needs attention"
  };
  return labels[status] || status;
}

function statusState(project: LibraryProject) {
  if (project.status === "failed" || project.latest_render?.status === "failed") return "error";
  if (["uploading", "transcribing", "directing", "rendering"].includes(project.status) || ["queued", "rendering"].includes(project.latest_render?.status || "")) return "working";
  if (["approved", "review", "completed"].includes(project.status) || project.latest_render?.status === "completed") return "ready";
  return "neutral";
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
    const state = statusState(project);
    return (
      <div className={styles.row} key={project.id}>
        <button type="button" className={styles.rowMain} onClick={() => open(project)}>
          <span className={styles.rowIcon}>{project.mode === "podcast" ? <Film size={18}/> : <Smartphone size={18}/>}</span>
          <span className={styles.rowCopy}>
            <strong>{project.title}</strong>
            <span className={styles.rowMeta}><span className={styles.rowMetaText}>{project.mode === "podcast" ? "Podcast" : "Reel"} · {duration(project)}</span></span>
            <span className={styles.statusPill} data-state={state}>{complete ? "Complete" : statusLabel(project.status)}</span>
            {!complete && render && render.status !== "completed" ? <span className={styles.miniProgress}><i style={{ width: `${Math.max(percent, 3)}%` }}/></span> : null}
          </span>
        </button>
        <div className={styles.rowActions}>
          <button type="button" className={`${styles.rowAction} ${styles.rowActionDanger}`} disabled={deleting === project.id} onClick={() => void trashProject(project)} aria-label={`Move ${project.title} to Recovery Bucket`} title="Move to Recovery Bucket">
            {deleting === project.id ? <Loader2 size={13} className={styles.spin}/> : <Trash2 size={13}/>} 
          </button>
        </div>
      </div>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.hero}>
          <div className={styles.heroCopy}>
            <div className={styles.eyebrow}>Apostolic Guide Media</div>
            <h1>Video Producer</h1>
            <p>Pick the work in front of you. The full editor only opens when you enter a project.</p>
          </div>
          <button type="button" className={styles.iconButton} onClick={() => void load()} disabled={loading} aria-label="Refresh projects">
            {loading ? <Loader2 size={18} className={styles.spin}/> : <RefreshCw size={18}/>} 
          </button>
        </header>

        <VideoProducerSectionNav active="projects"/>

        <div className={styles.actionBar}>
          <div className={styles.primaryActions}>
            <button type="button" className={styles.primaryButton} onClick={() => router.push("/admin/video-producer/new?mode=podcast")}><Plus size={14}/><Film size={14}/> Podcast</button>
            <button type="button" className={styles.secondaryButton} onClick={() => router.push("/admin/video-producer/new?mode=reels")}><Plus size={14}/><Smartphone size={14}/> Reel</button>
          </div>
          <Link className={styles.utilityLink} href="/admin/video-producer/recovery"><ArchiveRestore size={13}/> Recovery</Link>
        </div>

        {error ? <div className={styles.error}>{error}</div> : null}

        <section className={styles.section}>
          <div className={styles.sectionHead}><div className={styles.sectionTitle}><h2>In production</h2><span className={styles.count}>{active.length}</span></div></div>
          {loading && !roots.length ? <div className={styles.empty}>Loading projects…</div> : active.length ? <div className={styles.list}>{active.map((project) => projectRow(project))}</div> : <div className={styles.empty}>Nothing waiting on you. Start a Podcast or Reel above.</div>}
        </section>

        {done.length ? (
          <details className={styles.collapsible}>
            <summary><span>Completed projects · {done.length}</span><ChevronDown size={15}/></summary>
            <div className={styles.list}>{done.slice(0, 12).map((project) => projectRow(project, true))}</div>
          </details>
        ) : null}
      </div>
    </main>
  );
}
