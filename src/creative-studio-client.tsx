"use client";

import { toPng } from "html-to-image";
import { ArrowDown, ArrowUp, Check, Copy, CopyPlus, FileClock, Image as ImageIcon, Layers3, Loader2, Plus, RotateCcw, Save, Send, Sparkles, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CREATIVE_FORMAT_LABELS,
  CREATIVE_FORMATS,
  CREATIVE_INTENT_LABELS,
  CREATIVE_INTENTS,
  copyAllFrameCaptions,
  createBlankFrame,
  type CreativeEditorState,
  type CreativeFormat,
  type CreativeFrame,
  type CreativeIntent,
  type CreativeStatus
} from "@/creative-project";

type PathwayOption = { slug: string; title: string; collection: string; summary: string; steps: Array<{ reference: string; title: string; explanation: string }> };
type CreativeProject = {
  id: string;
  title: string;
  pathwaySlug: string;
  pathwayCollection: string;
  pathwayTitle: string;
  intent: CreativeIntent;
  format: CreativeFormat;
  destination: string;
  frameCount: number;
  status: CreativeStatus;
  editorState: CreativeEditorState;
  unifiedCaption: string;
  cta: string;
  scriptureReferences: string[];
  tags: string[];
  stateVersion: number;
  lastAutosavedAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
type Revision = { id: string; version: number; reason: string; change_summary?: string | null; snapshot: Record<string, unknown>; created_at: string; restored_from_revision_id?: string | null };
type AssetLink = { frame_id?: string | null; role: string; sort_order: number; asset?: { id: string; title: string; public_url?: string | null; metadata?: Record<string, unknown> } | null };

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data;
}

function statusLabel(status: CreativeStatus) {
  return status.replaceAll("_", " ").replace(/\b\w/g, (value) => value.toUpperCase());
}

function frameRoleLabel(role: CreativeFrame["role"]) {
  return role.replaceAll("_", " ").replace(/\b\w/g, (value) => value.toUpperCase());
}

function formatMeta(project: CreativeProject) {
  if (project.format === "single") return "1 frame";
  return `${project.editorState.frames.length} ${project.format === "story" ? "frames" : "slides"}`;
}

function SaveIndicator({ state, error }: { state: SaveState; error: string }) {
  if (state === "saving") return <span className="creative-save-state is-saving"><Loader2 size={14} className="spin"/> Saving...</span>;
  if (state === "error") return <span className="creative-save-state is-error">Save failed · {error}</span>;
  if (state === "dirty") return <span className="creative-save-state">Unsaved changes</span>;
  return <span className="creative-save-state is-saved"><Check size={14}/> Saved</span>;
}

export function CreativeStudioClient({ pathways, initialProjectId, aiReady }: { pathways: PathwayOption[]; initialProjectId?: string | null; aiReady: boolean }) {
  const router = useRouter();
  const [project, setProject] = useState<CreativeProject | null>(null);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [assets, setAssets] = useState<AssetLink[]>([]);
  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(initialProjectId));
  const [working, setWorking] = useState<string>("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [createPathway, setCreatePathway] = useState(pathways[0]?.slug ?? "");
  const [createIntent, setCreateIntent] = useState<CreativeIntent>("information");
  const [createFormat, setCreateFormat] = useState<CreativeFormat>("carousel");
  const [overrideCount, setOverrideCount] = useState(false);
  const [createCount, setCreateCount] = useState(7);
  const [structureCount, setStructureCount] = useState(6);
  const [structureInstruction, setStructureInstruction] = useState("");
  const [checkpointSummary, setCheckpointSummary] = useState("");
  const [previewRevision, setPreviewRevision] = useState<Revision | null>(null);
  const editCounter = useRef(0);
  const frameNodes = useRef<Record<string, HTMLDivElement | null>>({});

  const loadProject = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const data = await jsonRequest<{ project: CreativeProject; revisions: Revision[]; assets: AssetLink[] }>(`/api/admin/creative-projects/${id}`);
      setProject(data.project);
      setRevisions(data.revisions);
      setAssets(data.assets);
      setSelectedFrameId((current) => data.project.editorState.frames.some((frame) => frame.id === current) ? current : data.project.editorState.frames[0]?.id ?? null);
      setStructureCount(data.project.editorState.frames.length);
      setDirty(false);
      setSaveState("saved");
      setSaveError("");
    } catch (error) {
      setSaveState("error");
      setSaveError(error instanceof Error ? error.message : "Project could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialProjectId) void loadProject(initialProjectId);
    else setLoading(false);
  }, [initialProjectId, loadProject]);

  const selectedFrame = useMemo(() => project?.editorState.frames.find((frame) => frame.id === selectedFrameId) ?? project?.editorState.frames[0] ?? null, [project, selectedFrameId]);

  const mutateProject = useCallback((mutator: (current: CreativeProject) => CreativeProject) => {
    setProject((current) => current ? mutator(current) : current);
    editCounter.current += 1;
    setDirty(true);
    setSaveState("dirty");
    setSaveError("");
  }, []);

  const autosaveNow = useCallback(async () => {
    if (!project || !dirty) return project;
    const counter = editCounter.current;
    setSaveState("saving");
    try {
      const data = await jsonRequest<{ project: CreativeProject }>(`/api/admin/creative-projects/${project.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          expectedStateVersion: project.stateVersion,
          title: project.title,
          pathwaySlug: project.pathwaySlug,
          intent: project.intent,
          format: project.format,
          destination: project.destination,
          editorState: project.editorState,
          unifiedCaption: project.unifiedCaption,
          cta: project.cta,
          tags: project.tags
        })
      });
      setProject((current) => current && current.id === data.project.id ? { ...data.project, ...(editCounter.current !== counter ? {
        title: current.title,
        editorState: current.editorState,
        unifiedCaption: current.unifiedCaption,
        cta: current.cta,
        tags: current.tags
      } : {}) } : current);
      if (editCounter.current === counter) {
        setDirty(false);
        setSaveState("saved");
      } else setSaveState("dirty");
      return data.project;
    } catch (error) {
      setSaveState("error");
      setSaveError(error instanceof Error ? error.message : "Autosave failed.");
      throw error;
    }
  }, [dirty, project]);

  useEffect(() => {
    if (!dirty || !project || saveState === "saving") return;
    const timer = window.setTimeout(() => { void autosaveNow().catch(() => undefined); }, 900);
    return () => window.clearTimeout(timer);
  }, [autosaveNow, dirty, project, saveState]);

  async function createProject() {
    if (!createPathway) return;
    setWorking("create");
    try {
      const created = await jsonRequest<{ project: CreativeProject }>("/api/admin/creative-projects", {
        method: "POST",
        body: JSON.stringify({ pathwaySlug: createPathway, intent: createIntent, format: createFormat, ...(overrideCount ? { frameCount: createCount } : {}) })
      });
      setProject(created.project);
      setSelectedFrameId(created.project.editorState.frames[0]?.id ?? null);
      router.replace(`/admin/creative-studio?project=${created.project.id}`);
      if (aiReady) {
        setWorking("generate");
        const generated = await jsonRequest<{ project: CreativeProject }>("/api/admin/creative-studio/generate", {
          method: "POST",
          body: JSON.stringify({ projectId: created.project.id, action: "generate", ...(overrideCount ? { targetFrameCount: createCount } : {}) })
        });
        setProject(generated.project);
        setSelectedFrameId(generated.project.editorState.frames[0]?.id ?? null);
        setStructureCount(generated.project.editorState.frames.length);
        await loadProject(generated.project.id);
      } else await loadProject(created.project.id);
    } catch (error) {
      setSaveState("error");
      setSaveError(error instanceof Error ? error.message : "Project could not be created.");
    } finally {
      setWorking("");
    }
  }

  async function runGeneration(action: "generate" | "restructure" | "regenerate_frame", frameId?: string) {
    if (!project) return;
    await autosaveNow().catch(() => null);
    setWorking(action);
    try {
      const data = await jsonRequest<{ project: CreativeProject }>("/api/admin/creative-studio/generate", {
        method: "POST",
        body: JSON.stringify({
          projectId: project.id,
          action,
          instruction: structureInstruction,
          ...(action === "restructure" ? { targetFrameCount: structureCount } : {}),
          ...(frameId ? { frameId } : {})
        })
      });
      setProject(data.project);
      setSelectedFrameId(frameId && data.project.editorState.frames.some((frame) => frame.id === frameId) ? frameId : data.project.editorState.frames[0]?.id ?? null);
      setStructureCount(data.project.editorState.frames.length);
      setDirty(false);
      setSaveState("saved");
      await loadProject(data.project.id);
    } catch (error) {
      setSaveState("error");
      setSaveError(error instanceof Error ? error.message : "Sol could not generate the creative.");
    } finally {
      setWorking("");
    }
  }

  async function generateCaptions(scope: "all" | "unified" | "frame") {
    if (!project) return;
    await autosaveNow().catch(() => null);
    setWorking(`caption-${scope}`);
    try {
      const data = await jsonRequest<{ project: CreativeProject }>("/api/admin/creative-studio/captions", {
        method: "POST",
        body: JSON.stringify({ projectId: project.id, scope, ...(scope === "frame" ? { frameId: selectedFrame?.id } : {}) })
      });
      setProject(data.project);
      setDirty(false);
      setSaveState("saved");
      await loadProject(data.project.id);
    } catch (error) {
      setSaveState("error");
      setSaveError(error instanceof Error ? error.message : "Caption generation failed.");
    } finally {
      setWorking("");
    }
  }

  function updateFrame(frameId: string, patch: Partial<CreativeFrame>) {
    mutateProject((current) => ({
      ...current,
      editorState: { ...current.editorState, frames: current.editorState.frames.map((frame) => frame.id === frameId ? { ...frame, ...patch } : frame) }
    }));
  }

  function addFrame(afterId?: string) {
    if (!project || project.format === "single") return;
    mutateProject((current) => {
      const frames = [...current.editorState.frames];
      const index = afterId ? frames.findIndex((frame) => frame.id === afterId) + 1 : frames.length;
      const frame = createBlankFrame(index + 1, index === frames.length ? "cta" : "explanation");
      frame.pathwayLink = `/pathways/${current.pathwaySlug}`;
      frames.splice(index, 0, frame);
      const normalized = frames.map((item, itemIndex) => ({ ...item, order: itemIndex + 1 }));
      window.setTimeout(() => setSelectedFrameId(frame.id), 0);
      return { ...current, editorState: { ...current.editorState, frames: normalized }, frameCount: normalized.length };
    });
  }

  function duplicateFrame(frameId: string) {
    if (!project || project.format === "single") return;
    mutateProject((current) => {
      const index = current.editorState.frames.findIndex((frame) => frame.id === frameId);
      if (index < 0) return current;
      const source = current.editorState.frames[index];
      const clone = { ...source, id: crypto.randomUUID(), order: index + 2 };
      const frames = [...current.editorState.frames];
      frames.splice(index + 1, 0, clone);
      const normalized = frames.slice(0, 20).map((item, itemIndex) => ({ ...item, order: itemIndex + 1 }));
      window.setTimeout(() => setSelectedFrameId(clone.id), 0);
      return { ...current, editorState: { ...current.editorState, frames: normalized }, frameCount: normalized.length };
    });
  }

  function deleteFrame(frameId: string) {
    if (!project || project.format === "single" || project.editorState.frames.length <= 1) return;
    mutateProject((current) => {
      const frames = current.editorState.frames.filter((frame) => frame.id !== frameId).map((frame, index) => ({ ...frame, order: index + 1 }));
      window.setTimeout(() => setSelectedFrameId(frames[0]?.id ?? null), 0);
      return { ...current, editorState: { ...current.editorState, frames }, frameCount: frames.length };
    });
  }

  function moveFrame(frameId: string, delta: -1 | 1) {
    if (!project || project.format === "single") return;
    mutateProject((current) => {
      const frames = [...current.editorState.frames];
      const index = frames.findIndex((frame) => frame.id === frameId);
      const target = index + delta;
      if (index < 0 || target < 0 || target >= frames.length) return current;
      [frames[index], frames[target]] = [frames[target], frames[index]];
      return { ...current, editorState: { ...current.editorState, frames: frames.map((frame, itemIndex) => ({ ...frame, order: itemIndex + 1 })) } };
    });
  }

  async function checkpoint() {
    if (!project) return;
    setWorking("checkpoint");
    try {
      await autosaveNow();
      await jsonRequest(`/api/admin/creative-projects/${project.id}/checkpoint`, { method: "POST", body: JSON.stringify({ changeSummary: checkpointSummary }) });
      setCheckpointSummary("");
      await loadProject(project.id);
    } catch (error) {
      setSaveState("error");
      setSaveError(error instanceof Error ? error.message : "Version checkpoint failed.");
    } finally { setWorking(""); }
  }

  async function restoreRevision(revisionId: string) {
    if (!project) return;
    setWorking(`restore-${revisionId}`);
    try {
      const data = await jsonRequest<{ project: CreativeProject }>(`/api/admin/creative-projects/${project.id}/restore`, { method: "POST", body: JSON.stringify({ revisionId }) });
      setProject(data.project);
      setSelectedFrameId(data.project.editorState.frames[0]?.id ?? null);
      setPreviewRevision(null);
      await loadProject(project.id);
    } catch (error) {
      setSaveState("error");
      setSaveError(error instanceof Error ? error.message : "Revision could not be restored.");
    } finally { setWorking(""); }
  }

  async function duplicateProject(revisionId?: string) {
    if (!project) return;
    setWorking(`duplicate-${revisionId || "current"}`);
    try {
      const data = await jsonRequest<{ project: CreativeProject }>(`/api/admin/creative-projects/${project.id}/duplicate`, { method: "POST", body: JSON.stringify({ ...(revisionId ? { revisionId } : {}) }) });
      router.push(`/admin/creative-studio?project=${data.project.id}`);
    } catch (error) {
      setSaveState("error");
      setSaveError(error instanceof Error ? error.message : "Project could not be duplicated.");
    } finally { setWorking(""); }
  }

  async function renderAssets() {
    if (!project) return false;
    setWorking("render");
    try {
      const savedProject = await autosaveNow();
      if (!savedProject) return false;
      for (let index = 0; index < savedProject.editorState.frames.length; index += 1) {
        const frame = savedProject.editorState.frames[index];
        const node = frameNodes.current[frame.id];
        if (!node) throw new Error(`Frame ${index + 1} is not mounted for rendering.`);
        const dataUrl = await toPng(node, { cacheBust: true, pixelRatio: 3 });
        await jsonRequest(`/api/admin/creative-projects/${savedProject.id}/rendered-assets`, {
          method: "POST",
          body: JSON.stringify({ frameId: frame.id, sortOrder: index, title: `${savedProject.title} · ${savedProject.format === "story" ? "Frame" : "Slide"} ${index + 1}`, dataUrl, altText: frame.altText })
        });
      }
      await loadProject(savedProject.id);
      return true;
    } catch (error) {
      setSaveState("error");
      setSaveError(error instanceof Error ? error.message : "Rendered assets could not be saved.");
      return false;
    } finally { setWorking(""); }
  }

  async function markReady() {
    if (!project) return;
    const rendered = await renderAssets();
    if (!rendered) return;
    setWorking("ready");
    try {
      const data = await jsonRequest<{ project: CreativeProject }>(`/api/admin/creative-projects/${project.id}/status`, { method: "POST", body: JSON.stringify({ status: "ready" }) });
      setProject(data.project);
      await loadProject(project.id);
    } catch (error) {
      setSaveState("error");
      setSaveError(error instanceof Error ? error.message : "Project could not be marked Ready.");
    } finally { setWorking(""); }
  }

  async function copyText(text: string) {
    if (!text) return;
    await navigator.clipboard.writeText(text);
  }

  if (loading) return <section className="creative-studio-shell"><div className="creative-empty"><Loader2 className="spin"/> Loading Creative Project...</div></section>;

  if (!project) return <section className="creative-studio-shell">
    <div className="creative-page-head">
      <div><span className="creative-kicker">Publishing · Creative Studio</span><h1>Start with a permanent project.</h1><p>The project exists before Sol writes a line. Close Safari whenever you want. The work is still here.</p></div>
      <button type="button" className="creative-secondary" onClick={() => router.push("/admin/creative-library")}><Layers3 size={16}/> Creative Library</button>
    </div>
    <div className="creative-create-card">
      <label>Pathway<select value={createPathway} onChange={(event) => setCreatePathway(event.target.value)}>{pathways.map((pathway) => <option key={pathway.slug} value={pathway.slug}>{pathway.title}</option>)}</select></label>
      <label>Content intent<select value={createIntent} onChange={(event) => setCreateIntent(event.target.value as CreativeIntent)}>{CREATIVE_INTENTS.map((intent) => <option key={intent} value={intent}>{CREATIVE_INTENT_LABELS[intent]}</option>)}</select></label>
      <label>Format<select value={createFormat} onChange={(event) => setCreateFormat(event.target.value as CreativeFormat)}>{CREATIVE_FORMATS.map((format) => <option key={format} value={format}>{CREATIVE_FORMAT_LABELS[format]}</option>)}</select></label>
      {createFormat !== "single" ? <div className="creative-count-choice"><label className="creative-check"><input type="checkbox" checked={overrideCount} onChange={(event) => setOverrideCount(event.target.checked)}/> Override Sol’s frame count</label>{overrideCount ? <input type="number" min={1} max={12} value={createCount} onChange={(event) => setCreateCount(Math.max(1, Math.min(12, Number(event.target.value))))}/> : <small>Sol decides how many {createFormat === "story" ? "frames" : "slides"} the message actually needs.</small>}</div> : null}
      <button type="button" className="creative-primary" disabled={Boolean(working)} onClick={() => void createProject()}>{working ? <Loader2 size={16} className="spin"/> : <Sparkles size={16}/>} Create {aiReady ? "& Generate" : "Project"}</button>
      {!aiReady ? <p className="creative-warning">OPENAI_API_KEY is not configured. Persistence still works, but Sol generation is unavailable.</p> : null}
    </div>
  </section>;

  return <section className="creative-studio-shell">
    <div className="creative-project-head">
      <div>
        <span className="creative-kicker">Creative Studio</span>
        <input className="creative-project-title" value={project.title} onChange={(event) => mutateProject((current) => ({ ...current, title: event.target.value }))}/>
        <div className="creative-project-meta"><strong>{project.pathwayTitle}</strong><span>{CREATIVE_INTENT_LABELS[project.intent]}</span><span>{CREATIVE_FORMAT_LABELS[project.format]}</span><span>{formatMeta(project)}</span><span className={`creative-status is-${project.status}`}>{statusLabel(project.status)}</span><SaveIndicator state={saveState} error={saveError}/></div>
      </div>
      <div className="creative-head-actions">
        <button type="button" className="creative-secondary" onClick={() => router.push("/admin/creative-library")}><Layers3 size={16}/> Library</button>
        <button type="button" className="creative-secondary" disabled={working === "render"} onClick={() => void renderAssets()}>{working === "render" ? <Loader2 size={16} className="spin"/> : <ImageIcon size={16}/>} Render</button>
        <button type="button" className="creative-secondary" disabled={Boolean(working)} onClick={() => void checkpoint()}><Save size={16}/> Save Version</button>
        <button type="button" className="creative-primary" disabled={Boolean(working) || project.status === "publishing" || project.status === "scheduled"} onClick={() => void markReady()}><Check size={16}/> Ready</button>
        <button type="button" className="creative-primary" disabled={!(["ready", "published", "failed", "needs_manual_finish"] as CreativeStatus[]).includes(project.status)} onClick={() => router.push(`/admin/publishing?projectId=${project.id}`)}><Send size={16}/> Publish</button>
      </div>
    </div>

    <div className="creative-context-bar"><span>PATHWAY <strong>{project.pathwayTitle}</strong></span><span>INTENT <strong>{CREATIVE_INTENT_LABELS[project.intent]}</strong></span><span>FORMAT <strong>{CREATIVE_FORMAT_LABELS[project.format]}</strong></span><span>STATE <strong>v{project.stateVersion}</strong></span></div>

    <div className="creative-workspace-grid">
      <aside className="creative-frame-rail">
        <div className="creative-panel-head"><strong>{project.format === "story" ? "Frames" : project.format === "single" ? "Frame" : "Slides"}</strong>{project.format !== "single" ? <button type="button" onClick={() => addFrame(selectedFrame?.id)}><Plus size={15}/></button> : null}</div>
        {project.editorState.frames.map((frame, index) => <button type="button" key={frame.id} className={`creative-frame-row ${frame.id === selectedFrame?.id ? "is-active" : ""}`} onClick={() => setSelectedFrameId(frame.id)}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{frame.headline || frameRoleLabel(frame.role)}</strong><small>{frame.scripture || frameRoleLabel(frame.role)}</small></div></button>)}
        {project.format !== "single" ? <div className="creative-frame-rail-actions"><button type="button" onClick={() => selectedFrame && moveFrame(selectedFrame.id, -1)}><ArrowUp size={14}/></button><button type="button" onClick={() => selectedFrame && moveFrame(selectedFrame.id, 1)}><ArrowDown size={14}/></button><button type="button" onClick={() => selectedFrame && duplicateFrame(selectedFrame.id)}><CopyPlus size={14}/></button><button type="button" onClick={() => selectedFrame && deleteFrame(selectedFrame.id)}><Trash2 size={14}/></button></div> : null}
      </aside>

      <main className="creative-editor-panel">
        {selectedFrame ? <>
          <div className="creative-panel-head"><div><strong>{project.format === "story" ? "Frame" : project.format === "single" ? "Single Post" : "Slide"} {selectedFrame.order}</strong><small>{frameRoleLabel(selectedFrame.role)}</small></div>{aiReady ? <button type="button" className="creative-text-action" disabled={Boolean(working)} onClick={() => void runGeneration("regenerate_frame", selectedFrame.id)}>{working === "regenerate_frame" ? <Loader2 size={14} className="spin"/> : <Sparkles size={14}/>} Regenerate frame</button> : null}</div>
          <div className="creative-form-grid">
            <label>Role<select value={selectedFrame.role} onChange={(event) => updateFrame(selectedFrame.id, { role: event.target.value as CreativeFrame["role"] })}>{["hook","scripture","explanation","support","statement","cta"].map((role) => <option key={role} value={role}>{frameRoleLabel(role as CreativeFrame["role"])}</option>)}</select></label>
            <label>Scripture<input value={selectedFrame.scripture} onChange={(event) => updateFrame(selectedFrame.id, { scripture: event.target.value })} placeholder="John 1:14"/></label>
            <label className="span-2">Headline<input value={selectedFrame.headline} onChange={(event) => updateFrame(selectedFrame.id, { headline: event.target.value })}/></label>
            <label className="span-2">Body<textarea rows={5} value={selectedFrame.body} onChange={(event) => updateFrame(selectedFrame.id, { body: event.target.value })}/></label>
            <label className="span-2">Overlay text<textarea rows={2} value={selectedFrame.overlayText} onChange={(event) => updateFrame(selectedFrame.id, { overlayText: event.target.value })}/></label>
            <label className="span-2">Supporting notes<textarea rows={3} value={selectedFrame.supportingNotes} onChange={(event) => updateFrame(selectedFrame.id, { supportingNotes: event.target.value })}/></label>
            <label className="span-2">Frame CTA<input value={selectedFrame.cta} onChange={(event) => updateFrame(selectedFrame.id, { cta: event.target.value })}/></label>
          </div>

          <div className="creative-caption-card">
            <div className="creative-panel-head"><div><strong>{project.format === "carousel" ? `Slide ${selectedFrame.order} Caption` : "Supporting Caption"}</strong><small>Persistent copy for this frame</small></div><div className="creative-inline-actions"><button type="button" onClick={() => void copyText(selectedFrame.caption)}><Copy size={14}/> Copy</button>{aiReady ? <button type="button" disabled={Boolean(working)} onClick={() => void generateCaptions("frame")}><Sparkles size={14}/> Regenerate</button> : null}</div></div>
            <textarea rows={5} value={selectedFrame.caption} onChange={(event) => updateFrame(selectedFrame.id, { caption: event.target.value })}/>
            <label>Alt text<textarea rows={2} value={selectedFrame.altText} onChange={(event) => updateFrame(selectedFrame.id, { altText: event.target.value })}/></label>
          </div>
        </> : null}
      </main>

      <aside className="creative-preview-panel">
        <div className="creative-panel-head"><strong>Preview</strong><span>{project.format === "story" ? "9:16" : "4:5"}</span></div>
        <div className={`creative-frame-preview is-${project.format}`} ref={(node) => { if (selectedFrame) frameNodes.current[selectedFrame.id] = node; }}>
          {selectedFrame ? <><span className="creative-preview-eyebrow">{project.pathwayTitle} · {String(selectedFrame.order).padStart(2, "0")}</span><div className="creative-preview-copy"><h2>{selectedFrame.headline || "Untitled frame"}</h2>{selectedFrame.scripture ? <strong className="creative-preview-scripture">{selectedFrame.scripture}</strong> : null}{selectedFrame.body ? <p>{selectedFrame.body}</p> : null}{selectedFrame.overlayText ? <blockquote>{selectedFrame.overlayText}</blockquote> : null}</div>{selectedFrame.cta ? <span className="creative-preview-cta">{selectedFrame.cta}</span> : null}</> : null}
        </div>
        <div className="creative-visual-controls">
          <label>Visual style<select value={String(project.editorState.visualSettings.style || "editorial-white")} onChange={(event) => mutateProject((current) => ({ ...current, editorState: { ...current.editorState, visualSettings: { ...current.editorState.visualSettings, style: event.target.value } } }))}><option value="editorial-white">Editorial White</option><option value="street-theology">Street Theology</option><option value="verse-connection">Verse Connection</option></select></label>
          <label>Alignment<select value={String(project.editorState.visualSettings.alignment || "left")} onChange={(event) => mutateProject((current) => ({ ...current, editorState: { ...current.editorState, visualSettings: { ...current.editorState.visualSettings, alignment: event.target.value as "left" | "center" | "right" } } }))}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
        </div>
      </aside>
    </div>

    <div className="creative-render-stage" aria-hidden="true">{project.editorState.frames.map((frame) => <div key={`render-${frame.id}`} className={`creative-frame-preview is-${project.format}`} ref={(node) => { frameNodes.current[frame.id] = node; }}><span className="creative-preview-eyebrow">{project.pathwayTitle} · {String(frame.order).padStart(2, "0")}</span><div className="creative-preview-copy"><h2>{frame.headline || "Untitled frame"}</h2>{frame.scripture ? <strong className="creative-preview-scripture">{frame.scripture}</strong> : null}{frame.body ? <p>{frame.body}</p> : null}{frame.overlayText ? <blockquote>{frame.overlayText}</blockquote> : null}</div>{frame.cta ? <span className="creative-preview-cta">{frame.cta}</span> : null}</div>)}</div>

    <div className="creative-lower-grid">
      <section className="creative-card">
        <div className="creative-panel-head"><div><strong>Structure</strong><small>Sol can change the sequence without deleting the previous revision.</small></div></div>
        {project.format === "single" ? <p className="creative-muted">Single Post is exactly one frame.</p> : <><div className="creative-structure-row"><label>Target {project.format === "story" ? "frames" : "slides"}<input type="number" min={1} max={12} value={structureCount} onChange={(event) => setStructureCount(Math.max(1, Math.min(12, Number(event.target.value))))}/></label><label className="grow">Direction<input value={structureInstruction} onChange={(event) => setStructureInstruction(event.target.value)} placeholder="Add a slide between 3 and 4 explaining John 1:14"/></label><button type="button" className="creative-secondary" disabled={!aiReady || Boolean(working)} onClick={() => void runGeneration("restructure")}><Sparkles size={15}/> Restructure</button></div><div className="creative-inline-actions"><button type="button" onClick={() => addFrame()}><Plus size={14}/> Add frame</button><button type="button" disabled={!aiReady || Boolean(working)} onClick={() => void runGeneration("generate")}><Sparkles size={14}/> Regenerate whole creative</button></div></>}
      </section>

      <section className="creative-card">
        <div className="creative-panel-head"><div><strong>Unified Caption</strong><small>Written as one continuous post, not stitched slide captions.</small></div><div className="creative-inline-actions"><button type="button" onClick={() => void copyText(project.unifiedCaption)}><Copy size={14}/> Copy</button>{aiReady ? <button type="button" disabled={Boolean(working)} onClick={() => void generateCaptions("unified")}><Sparkles size={14}/> Regenerate</button> : null}</div></div>
        <textarea rows={8} value={project.unifiedCaption} onChange={(event) => mutateProject((current) => ({ ...current, unifiedCaption: event.target.value }))}/>
        <div className="creative-inline-actions"><button type="button" disabled={!aiReady || Boolean(working)} onClick={() => void generateCaptions("all")}><Sparkles size={14}/> Generate All Captions</button><button type="button" onClick={() => void copyText(copyAllFrameCaptions(project.editorState.frames))}><Copy size={14}/> Copy All Slide Captions</button></div>
      </section>

      <section className="creative-card">
        <div className="creative-panel-head"><div><strong>Project Settings</strong><small>These stay attached through every generation request.</small></div></div>
        <label>Project CTA<input value={project.cta} onChange={(event) => mutateProject((current) => ({ ...current, cta: event.target.value }))} placeholder="Comment JESUS for the pathway"/></label>
        <label>Tags<input value={project.tags.join(", ")} onChange={(event) => mutateProject((current) => ({ ...current, tags: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) }))} placeholder="oneness, jesus, deity"/></label>
        <div className="creative-asset-summary"><strong>{assets.length}</strong><span>linked Pathway Assets</span></div>
      </section>

      <section className="creative-card creative-history-card">
        <div className="creative-panel-head"><div><strong><FileClock size={16}/> Version History</strong><small>Manual saves and structural generations create checkpoints.</small></div><button type="button" className="creative-text-action" onClick={() => void duplicateProject()}><CopyPlus size={14}/> Duplicate current</button></div>
        <div className="creative-checkpoint-row"><input value={checkpointSummary} onChange={(event) => setCheckpointSummary(event.target.value)} placeholder="Changed slides 4–6"/><button type="button" className="creative-secondary" disabled={Boolean(working)} onClick={() => void checkpoint()}><Save size={14}/> Save</button></div>
        <div className="creative-version-list">{revisions.length ? revisions.map((revision) => <div className="creative-version-row" key={revision.id}><div><strong>v{revision.version}</strong><span>{revision.change_summary || revision.reason.replaceAll("_", " ")}</span><small>{new Date(revision.created_at).toLocaleString()}</small></div><div className="creative-inline-actions"><button type="button" onClick={() => setPreviewRevision(revision)}>Preview</button><button type="button" disabled={Boolean(working)} onClick={() => void restoreRevision(revision.id)}><RotateCcw size={13}/> Restore</button><button type="button" disabled={Boolean(working)} onClick={() => void duplicateProject(revision.id)}><CopyPlus size={13}/> Duplicate</button></div></div>) : <p className="creative-muted">No checkpoints yet. Autosave protects working state without flooding history.</p>}</div>
      </section>
    </div>

    {previewRevision ? <div className="creative-modal-backdrop" role="presentation" onClick={() => setPreviewRevision(null)}><div className="creative-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}><div className="creative-panel-head"><div><strong>Version {previewRevision.version}</strong><small>{previewRevision.change_summary || previewRevision.reason}</small></div><button type="button" onClick={() => setPreviewRevision(null)}>Close</button></div><div className="creative-revision-preview">{(((previewRevision.snapshot.editorState as Record<string, unknown> | undefined)?.frames as Array<Record<string, unknown>> | undefined) ?? []).map((frame, index) => <div key={index}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{String(frame.headline || "Untitled")}</strong><p>{String(frame.body || "")}</p><small>{String(frame.scripture || "")}</small></div></div>)}</div><div className="creative-inline-actions"><button type="button" className="creative-secondary" onClick={() => void restoreRevision(previewRevision.id)}><RotateCcw size={14}/> Restore as latest</button><button type="button" className="creative-secondary" onClick={() => void duplicateProject(previewRevision.id)}><CopyPlus size={14}/> Duplicate as new project</button></div></div></div> : null}
  </section>;
}
