"use client";

import { Archive, FileImage, Layers3, Loader2, Plus, RefreshCw, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CREATIVE_FORMAT_LABELS, CREATIVE_INTENT_LABELS, type CreativeFormat, type CreativeIntent, type CreativeStatus } from "@/creative-project";

type Project = {
  id: string;
  title: string;
  pathwaySlug: string;
  pathwayTitle: string;
  pathwayCollection: string;
  intent: CreativeIntent;
  format: CreativeFormat;
  frameCount: number;
  status: CreativeStatus;
  editorState: { frames: Array<{ headline: string; body: string; scripture: string }> };
  updatedAt: string;
  createdAt: string;
};

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "ready", label: "Ready" },
  { value: "scheduled", label: "Scheduled" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" }
];
const FORMAT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "All formats" },
  { value: "single", label: "Single" },
  { value: "carousel", label: "Carousel" },
  { value: "story", label: "Story" }
];

function statusLabel(status: string) {
  return status.replaceAll("_", " ").replace(/\b\w/g, (value) => value.toUpperCase());
}

function libraryErrorMessage(message: string) {
  if (message.includes("studio_creative_projects") || message.toLowerCase().includes("schema cache")) {
    return "Creative Projects storage is unavailable. Publishing now has a runtime preflight that identifies the missing database dependency.";
  }
  return message;
}

export function CreativeLibraryClient() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [status, setStatus] = useState("");
  const [format, setFormat] = useState("");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (format) params.set("format", format);
    if (debouncedQuery) params.set("q", debouncedQuery);
    if (status === "archived") params.set("includeArchived", "true");
    fetch(`/api/admin/creative-projects?${params.toString()}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || `Creative Library failed (${response.status}).`);
        if (!cancelled) setProjects(data.projects ?? []);
      })
      .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Creative Library could not be loaded."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [status, format, debouncedQuery, reloadKey]);

  const counts = useMemo(() => projects.reduce<Record<string, number>>((acc, project) => {
    acc[project.status] = (acc[project.status] ?? 0) + 1;
    return acc;
  }, {}), [projects]);

  return <section className="creative-library-shell">
    <div className="creative-page-head">
      <div><span className="creative-kicker">Publishing · Creative Library</span><h1>Your editable work, not an export folder.</h1><p>Every project reopens with its Pathway, intent, format, frames, captions, settings, and history intact.</p></div>
      <button type="button" className="creative-primary" onClick={() => router.push("/admin/creative-studio")}><Plus size={16}/> New Creative</button>
    </div>

    <div className="creative-library-stats">
      <div><strong>{projects.length}</strong><span>Visible</span></div>
      <div><strong>{counts.draft ?? 0}</strong><span>Draft</span></div>
      <div><strong>{counts.ready ?? 0}</strong><span>Ready</span></div>
      <div><strong>{counts.scheduled ?? 0}</strong><span>Scheduled</span></div>
      <div><strong>{counts.published ?? 0}</strong><span>Published</span></div>
    </div>

    <div className="creative-library-toolbar">
      <label className="creative-search"><Search size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search project, Pathway, Scripture, caption, tags..."/></label>
      <div className="creative-filter-pills">{STATUS_OPTIONS.map((option) => <button type="button" key={option.value || "all"} className={status === option.value ? "is-active" : ""} onClick={() => setStatus(option.value)}>{option.value === "archived" ? <Archive size={13}/> : null}{option.label}</button>)}</div>
      <select value={format} onChange={(event) => setFormat(event.target.value)}>{FORMAT_OPTIONS.map((option) => <option key={option.value || "all"} value={option.value}>{option.label}</option>)}</select>
    </div>

    {error ? <div className="creative-error-banner"><span>{libraryErrorMessage(error)}</span><button type="button" className="creative-small-button" onClick={() => setReloadKey((value) => value + 1)}><RefreshCw size={14}/> Retry</button></div> : null}
    {loading ? <div className="creative-empty"><Loader2 className="spin"/> Loading Creative Library...</div> : projects.length ? <div className="creative-library-table" role="table">
      <div className="creative-library-row is-head" role="row"><span>Preview</span><span>Project</span><span>Format</span><span>Pathway</span><span>Status</span><span>Edited</span></div>
      {projects.map((project) => {
        const first = project.editorState.frames[0];
        return <button type="button" className="creative-library-row" role="row" key={project.id} onClick={() => router.push(`/admin/creative-studio?project=${project.id}`)}>
          <span className={`creative-library-preview is-${project.format}`}><FileImage size={15}/><small>{project.format === "single" ? "1" : project.frameCount}</small></span>
          <span className="creative-library-project"><strong>{project.title}</strong><small>{first?.headline || first?.scripture || CREATIVE_INTENT_LABELS[project.intent]}</small></span>
          <span>{CREATIVE_FORMAT_LABELS[project.format]}{project.format !== "single" ? ` · ${project.frameCount}` : ""}</span>
          <span><strong>{project.pathwayTitle}</strong><small>{project.pathwayCollection}</small></span>
          <span><i className={`creative-status is-${project.status}`}>{statusLabel(project.status)}</i></span>
          <span>{new Date(project.updatedAt).toLocaleString()}</span>
        </button>;
      })}
    </div> : !error ? <div className="creative-empty"><Layers3 size={24}/><strong>No Creative Projects match this view.</strong><span>Create one or clear the filters.</span></div> : null}
  </section>;
}
