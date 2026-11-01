"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  Film,
  FolderOpen,
  Library,
  Loader2,
  RefreshCw,
  RotateCcw,
  Send,
  Smartphone
} from "lucide-react";
import { videoProducerRenderControl, type VideoProducerRenderStatus } from "@/video-producer-render-control";
import styles from "./video-producer-project-library.module.css";

type LibraryRender = {
  id: string;
  status: VideoProducerRenderStatus;
  progress?: { percent?: number; stage?: string; heartbeatAt?: string } | null;
  error?: string | null;
  requested_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
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
  created_at?: string | null;
  updated_at?: string | null;
  latest_render?: LibraryRender | null;
};

type LibraryFilter = "production" | "ready" | "all";

const LAST_PROJECT_KEY = "apostolic-guide:video-producer:last-project";
const WORKSPACE_SELECT = "main.min-h-screen header select";
const ACTIVE_STATUSES = new Set(["draft", "uploading", "uploaded", "transcribing", "directing", "planned", "approved", "rendering", "failed"]);

function formatDuration(seconds?: number | null) {
  const value = Math.max(0, Number(seconds || 0));
  if (!value) return "No duration";
  const total = Math.round(value);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}` : `${minutes}:${String(secs).padStart(2, "0")}`;
}

function statusLabel(status: string) {
  if (status === "uploading") return "Uploading";
  if (status === "transcribing") return "Transcribing";
  if (status === "directing") return "Sol directing";
  if (status === "planned") return "Plan ready";
  if (status === "approved") return "Approved";
  if (status === "rendering") return "Rendering";
  if (status === "review") return "Ready to review";
  if (status === "completed") return "Complete";
  if (status === "failed") return "Needs attention";
  if (status === "uploaded") return "Source ready";
  return "Draft";
}

function statusClass(status: string) {
  if (status === "failed") return `${styles.status} ${styles.statusFailed}`;
  if (status === "review" || status === "completed") return `${styles.status} ${styles.statusReady}`;
  if (status === "rendering") return `${styles.status} ${styles.statusRendering}`;
  if (ACTIVE_STATUSES.has(status)) return `${styles.status} ${styles.statusWorking}`;
  return styles.status;
}

function renderPercent(render?: LibraryRender | null) {
  if (!render) return 0;
  if (render.status === "completed") return 100;
  return Math.max(0, Math.min(100, Number(render.progress?.percent || 0)));
}

function renderStage(render?: LibraryRender | null) {
  if (!render) return "No render yet";
  return render.progress?.stage || (render.status === "completed" ? "Ready to review" : render.status);
}

function groupIsActive(root: LibraryProject, children: LibraryProject[]) {
  return ACTIVE_STATUSES.has(root.status) || children.some((child) => ACTIVE_STATUSES.has(child.status));
}

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store"
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data as T;
}

export function VideoProducerProjectLibrary() {
  const [projects, setProjects] = useState<LibraryProject[]>([]);
  const [filter, setFilter] = useState<LibraryFilter>("production");
  const [loading, setLoading] = useState(true);
  const [busyProject, setBusyProject] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const restoredRef = useRef(false);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      const data = await jsonRequest<{ projects: LibraryProject[] }>("/api/admin/video-producer/library");
      setProjects(data.projects ?? []);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Project library could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadProjects(); }, [loadProjects]);

  const childrenByParent = useMemo(() => {
    const map = new Map<string, LibraryProject[]>();
    for (const project of projects) {
      if (!project.parent_project_id) continue;
      const current = map.get(project.parent_project_id) ?? [];
      current.push(project);
      map.set(project.parent_project_id, current);
    }
    for (const children of map.values()) {
      children.sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
    }
    return map;
  }, [projects]);

  const roots = useMemo(() => projects.filter((project) => !project.parent_project_id), [projects]);

  const visibleRoots = useMemo(() => roots.filter((root) => {
    if (filter === "all") return true;
    const active = groupIsActive(root, childrenByParent.get(root.id) ?? []);
    return filter === "production" ? active : !active;
  }), [childrenByParent, filter, roots]);

  const productionCount = useMemo(() => roots.filter((root) => groupIsActive(root, childrenByParent.get(root.id) ?? [])).length, [childrenByParent, roots]);
  const readyCount = roots.length - productionCount;

  const selectWorkspaceProject = useCallback((projectId: string, shouldScroll = true) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(LAST_PROJECT_KEY, projectId);
    const url = new URL(window.location.href);
    url.searchParams.set("project", projectId);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);

    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      const select = document.querySelector<HTMLSelectElement>(WORKSPACE_SELECT);
      const optionExists = Boolean(select && Array.from(select.options).some((option) => option.value === projectId));
      if (select && optionExists) {
        if (select.value !== projectId) {
          select.value = projectId;
          select.dispatchEvent(new Event("change", { bubbles: true }));
        }
        window.clearInterval(timer);
        if (shouldScroll) document.querySelector("main.min-h-screen")?.scrollIntoView({ behavior: "smooth", block: "start" });
      } else if (attempts >= 40) {
        window.clearInterval(timer);
      }
    }, 125);
  }, []);

  useEffect(() => {
    if (!projects.length || restoredRef.current || typeof window === "undefined") return;
    const validIds = new Set(projects.map((project) => project.id));
    const urlProject = new URLSearchParams(window.location.search).get("project");
    const savedProject = window.localStorage.getItem(LAST_PROJECT_KEY);
    const activeRoot = roots.find((root) => groupIsActive(root, childrenByParent.get(root.id) ?? []));
    const target = (urlProject && validIds.has(urlProject) && urlProject)
      || (savedProject && validIds.has(savedProject) && savedProject)
      || activeRoot?.id
      || "";
    restoredRef.current = true;
    if (target) selectWorkspaceProject(target, false);
  }, [childrenByParent, projects, roots, selectWorkspaceProject]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const rememberSelection = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLSelectElement) || !target.matches(WORKSPACE_SELECT) || !target.value) return;
      window.localStorage.setItem(LAST_PROJECT_KEY, target.value);
      const url = new URL(window.location.href);
      url.searchParams.set("project", target.value);
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    };
    document.addEventListener("change", rememberSelection, true);
    return () => document.removeEventListener("change", rememberSelection, true);
  }, []);

  async function runRenderControl(project: LibraryProject) {
    const control = videoProducerRenderControl(project.status, project.latest_render?.status, Boolean(project.approval_fingerprint));
    if (!control) return;
    if (control.force) {
      const confirmed = window.confirm("Restart this render from 0%? The raw upload, transcript, Sol edit plan and approval are preserved. The current worker will be invalidated before the new one starts.");
      if (!confirmed) return;
    }

    setBusyProject(project.id);
    setActionMessage("");
    setError("");
    try {
      await jsonRequest("/api/admin/video-producer/render-retry", {
        method: "POST",
        body: JSON.stringify({ projectId: project.id, force: control.force })
      });
      await jsonRequest("/api/admin/video-producer/render", {
        method: "POST",
        body: JSON.stringify({ projectId: project.id })
      });
      setActionMessage(`${project.title}: fresh render worker queued. All upstream project work was preserved.`);
      selectWorkspaceProject(project.id, false);
      await loadProjects();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "The render could not be restarted.");
      await loadProjects();
    } finally {
      setBusyProject(null);
    }
  }

  function renderButtons(project: LibraryProject, compact = false) {
    const control = videoProducerRenderControl(project.status, project.latest_render?.status, Boolean(project.approval_fingerprint));
    if (compact) {
      return (
        <div className={styles.childButtons}>
          {control && (
            <button
              type="button"
              className={`${styles.iconButton} ${control.action === "restart" ? styles.iconButtonDanger : ""}`}
              disabled={busyProject === project.id}
              onClick={() => void runRenderControl(project)}
              title={control.description}
              aria-label={`${control.label}: ${project.title}`}
            >
              {busyProject === project.id ? <Loader2 size={13} /> : <RotateCcw size={13} />}
            </button>
          )}
          <button type="button" className={styles.iconButton} onClick={() => selectWorkspaceProject(project.id)} title="Open in workspace" aria-label={`Open ${project.title}`}>
            <ChevronRight size={14} />
          </button>
        </div>
      );
    }

    return (
      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={() => selectWorkspaceProject(project.id)}>
          <FolderOpen size={13} /> OPEN PROJECT
        </button>
        {control && (
          <button
            type="button"
            className={control.action === "restart" ? styles.danger : styles.secondary}
            disabled={busyProject === project.id}
            onClick={() => void runRenderControl(project)}
            title={control.description}
          >
            {busyProject === project.id ? <Loader2 size={13} /> : <RotateCcw size={13} />} {control.label}
          </button>
        )}
        {project.latest_render?.status === "completed" && (
          <a className={styles.secondary} href="/admin/publishing">
            <Send size={13} /> OPEN PUBLISHING
          </a>
        )}
      </div>
    );
  }

  function projectCard(root: LibraryProject) {
    const children = childrenByParent.get(root.id) ?? [];
    const progress = renderPercent(root.latest_render);
    const isWorking = groupIsActive(root, children);
    return (
      <article key={root.id} className={`${styles.card} ${isWorking ? styles.cardActive : ""}`}>
        <div className={styles.cardTop}>
          <div className={styles.row}>
            <div className={styles.icon}>{root.mode === "podcast" ? <Film size={17} /> : <Smartphone size={17} />}</div>
            <div className={styles.meta}>
              <div className={styles.projectTitle}>{root.title}</div>
              <div className={styles.projectMeta}>{root.mode === "podcast" ? "PARENT PODCAST" : "STANDALONE REEL"} · {formatDuration(root.source_duration)}{children.length ? ` · ${children.length} reel${children.length === 1 ? "" : "s"}` : ""}</div>
            </div>
            <span className={statusClass(root.status)}>{statusLabel(root.status)}</span>
          </div>

          {root.latest_render && (
            <div className={styles.progressBox}>
              <div className={styles.progressLine}><span>{renderStage(root.latest_render)}</span><strong>{progress}%</strong></div>
              <div className={styles.progressTrack}><div className={styles.progressFill} style={{ width: `${Math.max(progress, progress > 0 ? 2 : 0)}%` }} /></div>
            </div>
          )}

          {renderButtons(root)}
        </div>

        {children.length > 0 && (
          <div className={styles.children}>
            <div className={styles.childrenLabel}>Reels inside this project</div>
            {children.map((child) => (
              <div className={styles.child} key={child.id}>
                <div className={styles.childIcon}><Smartphone size={12} /></div>
                <div>
                  <div className={styles.childTitle}>{child.title}</div>
                  <div className={styles.childMeta}>{statusLabel(child.status)}{child.latest_render ? ` · ${renderPercent(child.latest_render)}% · ${renderStage(child.latest_render)}` : ""}</div>
                </div>
                {renderButtons(child, true)}
              </div>
            ))}
          </div>
        )}
      </article>
    );
  }

  return (
    <section className={styles.library} aria-label="Video Producer project library">
      <div className={styles.shell}>
        <div className={styles.header}>
          <div>
            <div className={styles.eyebrow}>Apostolic Guide Media</div>
            <h2 className={styles.title}><Library size={20} style={{ verticalAlign: "-2px", marginRight: 8 }} />Project Library</h2>
            <p className={styles.subtitle}>Long-form episodes are parent projects. Reels stay nested underneath the episode they came from, so you can leave the workspace, come back later, retry a render, review output, or move toward publishing without losing the production history.</p>
          </div>
          <button type="button" className={styles.refresh} onClick={() => void loadProjects()} disabled={loading}>
            {loading ? <Loader2 size={13} /> : <RefreshCw size={13} />} REFRESH LIBRARY
          </button>
        </div>

        <div className={styles.toolbar}>
          <button type="button" className={`${styles.tab} ${filter === "production" ? styles.tabActive : ""}`} onClick={() => setFilter("production")}>In production · {productionCount}</button>
          <button type="button" className={`${styles.tab} ${filter === "ready" ? styles.tabActive : ""}`} onClick={() => setFilter("ready")}>Ready / old · {readyCount}</button>
          <button type="button" className={`${styles.tab} ${filter === "all" ? styles.tabActive : ""}`} onClick={() => setFilter("all")}>All · {roots.length}</button>
        </div>

        {error && <div className={styles.error}>{error}</div>}
        {actionMessage && !error && <div className={styles.error} style={{ borderColor: "rgba(55,125,255,.25)", background: "rgba(55,125,255,.07)", color: "#bcd1ff" }}>{actionMessage}</div>}

        <div className={styles.grid}>
          {loading && !projects.length ? <div className={styles.empty}>Loading Video Producer projects…</div> : visibleRoots.length ? visibleRoots.map(projectCard) : <div className={styles.empty}>No projects in this section yet.</div>}
        </div>

        <div className={styles.note}>Render recovery intentionally restarts FFmpeg from 0%. It does not re-upload the source, re-transcribe the episode, or re-run Sol. The approved edit remains the source of truth.</div>
      </div>
    </section>
  );
}
