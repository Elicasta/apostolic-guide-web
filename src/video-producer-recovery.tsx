"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArchiveRestore, ArrowLeft, Film, Loader2, RefreshCw, Smartphone } from "lucide-react";
import Link from "next/link";
import styles from "./video-producer-sequential.module.css";

type RecoveryProject = {
  id: string;
  title: string;
  mode: "podcast" | "reels";
  status: string;
  parent_project_id: string | null;
  source_filename?: string | null;
  source_duration?: number | null;
  source_range_start?: number | null;
  source_range_end?: number | null;
  deleted_at?: string | null;
};

function duration(project: RecoveryProject) {
  const seconds = project.source_range_start != null && project.source_range_end != null
    ? Math.max(0, project.source_range_end - project.source_range_start)
    : Math.max(0, Number(project.source_duration || 0));
  const total = Math.round(seconds);
  if (!total) return "—";
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, "0")}`;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store", headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Recovery request failed.");
  return data as T;
}

export function VideoProducerRecovery() {
  const [projects, setProjects] = useState<RecoveryProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await requestJson<{ projects?: RecoveryProject[] }>("/api/admin/video-producer/recovery");
      setProjects(data.projects ?? []);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Recovery Bucket could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const map = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
  const roots = projects.filter((project) => !project.parent_project_id);
  const orphanedChildren = projects.filter((project) => project.parent_project_id && !map.has(project.parent_project_id));

  async function restore(project: RecoveryProject) {
    setRestoring(project.id); setError("");
    try {
      await requestJson(`/api/admin/video-producer/projects/${project.id}/trash`, { method: "POST", body: JSON.stringify({ action: "restore" }) });
      if (!project.parent_project_id) setProjects((current) => current.filter((item) => item.id !== project.id && item.parent_project_id !== project.id));
      else setProjects((current) => current.filter((item) => item.id !== project.id));
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Project could not be restored.");
    } finally {
      setRestoring(null);
    }
  }

  function row(project: RecoveryProject, child = false) {
    return (
      <div className={styles.projectRow} key={project.id} style={child ? { marginLeft: 22, width: "calc(100% - 22px)" } : undefined}>
        <span className={styles.projectIcon}>{project.mode === "podcast" ? <Film size={18}/> : <Smartphone size={18}/>}</span>
        <span className={styles.projectCopy}>
          <strong>{project.title}</strong>
          <small>{project.mode === "podcast" ? "Podcast" : "Reel"} · {duration(project)}{child ? " · attached Reel" : ""}</small>
        </span>
        <button type="button" className={styles.smallAction} disabled={restoring === project.id || Boolean(project.parent_project_id && map.has(project.parent_project_id))} onClick={() => void restore(project)} title={project.parent_project_id && map.has(project.parent_project_id) ? "Restore the parent Podcast to restore this Reel." : "Restore project"}>
          {restoring === project.id ? <Loader2 size={13} className={styles.spin}/> : <ArchiveRestore size={13}/>} Restore
        </button>
      </div>
    );
  }

  return (
    <main className={styles.dashboard}>
      <div className={styles.dashboardShell}>
        <div className={styles.libraryUtilityRow} style={{ marginBottom: 18 }}>
          <Link className={styles.backLink} href="/admin/video-producer"><ArrowLeft size={14}/> Video Producer</Link>
          <button type="button" className={styles.iconAction} onClick={() => void load()} disabled={loading} aria-label="Refresh Recovery Bucket">{loading ? <Loader2 size={18} className={styles.spin}/> : <RefreshCw size={18}/>}</button>
        </div>
        <header className={styles.dashboardHeader}>
          <div>
            <div className={styles.eyebrow}>Safety net</div>
            <h1>Recovery Bucket</h1>
            <p>Delete removes a project from the active Video Producer without immediately destroying its private source, renders, transcript or Reel package. Restore brings it back.</p>
          </div>
        </header>

        <div className={`${styles.notice} ${styles.warning}`}>This is intentionally recovery-only for now. There is no permanent-delete button here, so one wrong tap cannot erase a source master that a Podcast and its Reels may share.</div>
        {error ? <div className={styles.error} style={{ marginTop: 14 }}>{error}</div> : null}

        <section className={styles.projectSection}>
          <div className={styles.sectionHeading}><h2>Removed projects</h2><span>{projects.length}</span></div>
          {loading && !projects.length ? <div className={styles.empty}>Loading Recovery Bucket…</div> : projects.length ? (
            <div className={styles.projectList}>
              {roots.map((project) => <div key={project.id}>{row(project)}{projects.filter((item) => item.parent_project_id === project.id).map((child) => row(child, true))}</div>)}
              {orphanedChildren.map((project) => row(project))}
            </div>
          ) : <div className={styles.empty}>Recovery Bucket is empty.</div>}
        </section>
      </div>
    </main>
  );
}
