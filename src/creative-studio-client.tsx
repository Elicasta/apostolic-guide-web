"use client";
import { initialCodeTheme } from "./carousel-code";

import {CarouselCodePanel} from './carousel-code-panel';
import {codeTheme,type CarouselCodeJson} from './carousel-code';
import { CarouselPreview, artworkPng } from './carousel-preview';
import { CarouselBackgroundPanel } from './carousel-background-panel';
import { CarouselDesignPanel } from './carousel-design-panel';
import { frameDesign, themeFromSettings, type StudioDesign } from './carousel-composition';
import type { ArtworkInput } from './carousel-artwork';
import styles from './carousel-studio-v3.module.css';
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
  if (state === "saving") return <span className="cs3-save-state is-saving"><Loader2 size={14} className="spin"/> Saving...</span>;
  if (state === "error") return <span className="cs3-save-state is-error">Save failed · {error}</span>;
  if (state === "dirty") return <span className="cs3-save-state">Unsaved changes</span>;
  return <span className="cs3-save-state is-saved"><Check size={14}/> Saved</span>;
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
  const [codeOpen,setCodeOpen]=useState(false);
  const [backgrounds, setBackgrounds] = useState<Record<string,string>>({});
  const [issues, setIssues] = useState<string[]>([]);
  const [past,setPast] = useState<CreativeEditorState[]>([]);
  const [future,setFuture] = useState<CreativeEditorState[]>([]);
  const saveInFlight = useRef(false);

  const loadProject = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const data = await jsonRequest<{ project: CreativeProject; revisions: Revision[]; assets: AssetLink[] }>(`/api/admin/creative-projects/${id}`);
      const [designs,artwork] = await Promise.all([
        jsonRequest<{designs:Array<{frameId:string;design:StudioDesign}>}>(`/api/admin/creative-projects/${id}/frame-design`),
        jsonRequest<{backgrounds:Array<{frameId:string;previewUrl:string}>}>(`/api/admin/creative-projects/${id}/artwork`)
      ]);
      const legacy = Object.fromEntries(designs.designs.map(item=>[item.frameId,item.design]));
      data.project.editorState.visualSettings.frameDesigns = {...legacy,...(data.project.editorState.visualSettings.frameDesigns as Record<string,StudioDesign> || {})};
      setBackgrounds(Object.fromEntries(artwork.backgrounds.filter(item=>item.previewUrl).reverse().map(item=>[item.frameId,item.previewUrl])));
      setProject(data.project);
      setPast([]);setFuture([]);
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
    const timer=window.setTimeout(()=>{if(initialProjectId)void loadProject(initialProjectId);else setLoading(false);},0);
    return ()=>window.clearTimeout(timer);
  }, [initialProjectId, loadProject]);

  const selectedFrame = useMemo(() => project?.editorState.frames.find((frame) => frame.id === selectedFrameId) ?? project?.editorState.frames[0] ?? null, [project, selectedFrameId]);

  // Signal the artboard directly after React commits a theme, frame or copy
  // change. Avoid relying on the browser refresh or DOM polling as the only
  // source of preview updates.
  useEffect(() => {
    if (project) window.dispatchEvent(new Event("ag:creative-editor-updated"));
  }, [project, selectedFrameId]);

  const mutateProject = useCallback((mutator: (current: CreativeProject) => CreativeProject) => {
    if (project && project.status !== 'draft') return;
    if (project) {setPast(history=>[...history.slice(-79),project.editorState]);setFuture([]);}
    setProject((current) => current ? mutator(current) : current);
    editCounter.current += 1;
    setDirty(true);
    setSaveState("dirty");
    setSaveError("");
  }, [project]);

  useEffect(() => {
    if (!initialProjectId) return;
    const apply = (event: Event) => {
      const template = (event as CustomEvent<{ template?: string }>).detail?.template;
      if (!template || !["street-theology", "editorial-white", "cinematic", "verse-connection", "manifesto"].includes(template)) return;
      mutateProject((current) => ({ ...current, editorState: {
        ...current.editorState, visualSettings: { ...current.editorState.visualSettings, style: template }
      } }));
    };
    window.addEventListener("ag:creative-template-select", apply);
    return () => window.removeEventListener("ag:creative-template-select", apply);
  }, [initialProjectId, mutateProject]);

  const autosaveNow = useCallback(async () => {
    if (!project || !dirty) return project;
    if (saveInFlight.current) throw new Error('A save is already in progress. Please retry after it finishes.');
    saveInFlight.current = true;
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
    } finally {saveInFlight.current = false;}
  }, [dirty, project]);

  useEffect(() => {
    if (!dirty || !project || saveState === "saving" || saveState === "error") return;
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
    if (!project || project.status !== 'draft') return;
    try { await autosaveNow(); } catch { return; }
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
    if (!project || project.status !== 'draft') return;
    try { await autosaveNow(); } catch { return; }
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
      return { ...current, editorState: { ...current.editorState, frames: normalized, visualSettings:{...current.editorState.visualSettings,frameDesigns:{...(current.editorState.visualSettings.frameDesigns as Record<string,StudioDesign>||{}),[clone.id]:frameDesign(current.editorState.visualSettings,frameId)}} }, frameCount: normalized.length };
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
      await autosaveNow();
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
        const dataUrl = await artworkPng(artworkInput(savedProject, frame, index));
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


  async function applyCode(json:CarouselCodeJson) {
    if(!project||project.status!=='draft')throw new Error('Code Mode only edits drafts.');
    setWorking('code');
    try {const saved=await autosaveNow();if(!saved)throw new Error('Save the project first.');
      const result=await jsonRequest<{project:CreativeProject}>(`/api/admin/creative-projects/${saved.id}/code`,{method:'PUT',body:JSON.stringify({expectedStateVersion:saved.stateVersion,carousel:json})});
      setProject(result.project);setDirty(false);setSaveState('saved');setPast([]);setFuture([]);
    } finally {setWorking('');}
  }
  async function restoreCode(revisionId:string) {
    if(!project||project.status!=='draft')throw new Error('Code Mode only edits drafts.');
    setWorking('code');try {const saved=await autosaveNow();if(!saved)throw new Error('Save the project first.');
      const result=await jsonRequest<{project:CreativeProject}>(`/api/admin/creative-projects/${saved.id}/code`,{method:'PUT',body:JSON.stringify({expectedStateVersion:saved.stateVersion,revisionId})});setProject(result.project);setDirty(false);setSaveState('saved');setPast([]);setFuture([]);
    } finally {setWorking('');}
  }
  function artworkInput(current:CreativeProject,frame:CreativeFrame,index:number):Omit<ArtworkInput,'brandAssets'> {
    return {codeTheme:codeTheme(current.editorState),projectId:current.id,stateVersion:current.stateVersion,frame,index,total:current.editorState.frames.length,pathwayTitle:current.pathwayTitle,projectTitle:current.title,
      theme:themeFromSettings(current.editorState.visualSettings),regenerationSeed:Number(current.editorState.visualSettings.regenerationSeed||0),
      design:frameDesign(current.editorState.visualSettings,frame.id),height:current.format==='story'?1920:1350,backgroundUrl:backgrounds[frame.id]};
  }
  function updateDesign(id:string,patch:StudioDesign,reset=false) {
    mutateProject(current=>({...current,editorState:{...current.editorState,visualSettings:{...current.editorState.visualSettings,
      frameDesigns:{...(current.editorState.visualSettings.frameDesigns as Record<string,StudioDesign>||{}),[id]:reset?{}:{...frameDesign(current.editorState.visualSettings,id),...patch}}
    }}}));
  }
  function travelHistory(direction:'undo'|'redo') {
    if(!project)return;
    const source=direction==='undo'?past:future;
    const state=source[source.length-1];if(!state)return;
    if(direction==='undo'){setPast(source.slice(0,-1));setFuture(items=>[...items,project.editorState]);}
    else {setFuture(source.slice(0,-1));setPast(items=>[...items,project.editorState]);}
    setProject({...project,editorState:state});editCounter.current+=1;setDirty(true);setSaveState('dirty');
  }
  async function downloadFrame() {
    if(!project||!selectedFrame)return;
    setWorking('download');
    try {const saved=await autosaveNow();if(!saved)throw new Error('Save first');const url=await artworkPng(artworkInput(saved,selectedFrame,saved.editorState.frames.findIndex(f=>f.id===selectedFrame.id)));
      const link=document.createElement('a');link.href=url;link.download=`${project.pathwaySlug}-${selectedFrame.order}.png`;link.click();
    }catch(error){setSaveError(error instanceof Error?error.message:'Export failed.');setSaveState('error');}
    finally {setWorking('');}
  }
  useEffect(()=>{
    const warn=(event:BeforeUnloadEvent)=>{if(dirty){event.preventDefault();event.returnValue='';}};
    window.addEventListener('beforeunload',warn);return ()=>window.removeEventListener('beforeunload',warn);
  },[dirty]);

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

  return <section className={styles.studio} data-code-mode-open={codeOpen} data-studio-version="3" data-creative-template={String(project?.editorState.visualSettings.style || project?.editorState.visualSettings.template || "editorial-white")}>
    <div className="cs3-project-head">
      <div>
        <span className="cs3-kicker">Carousel Studio / 3.0</span>
        <input className="cs3-project-title" disabled={Boolean(working)||project.status!=='draft'} maxLength={180} value={project.title} onChange={(event) => mutateProject((current) => ({ ...current, title: event.target.value }))}/>
        <div className="cs3-project-meta"><strong>{project.pathwayTitle}</strong><span>{CREATIVE_INTENT_LABELS[project.intent]}</span><span>{CREATIVE_FORMAT_LABELS[project.format]}</span><span>{formatMeta(project)}</span><span className={`cs3-status is-${project.status}`}>{statusLabel(project.status)}</span><SaveIndicator state={saveState} error={saveError}/></div>
      </div>
      <div className="cs3-head-actions">
        <button type="button" className="cs3-secondary" onClick={() => router.push("/admin/creative-library")}><Layers3 size={16}/> Library</button>
        {project.status!=='draft'&&<button type="button" disabled={Boolean(working)} onClick={()=>void jsonRequest(`/api/admin/creative-projects/${project.id}/status`,{method:'POST',body:JSON.stringify({status:'draft'})}).then(()=>loadProject(project.id)).catch(error=>{setSaveError(error.message);setSaveState('error');})}>Return to Draft to edit</button>}
        <button type="button" className="cs3-secondary" disabled={Boolean(working)||saveState==='saving'} onClick={() => void renderAssets()}>{working === "render" ? <Loader2 size={16} className="spin"/> : <ImageIcon size={16}/>} Render</button>
        <button type="button" className="cs3-secondary" disabled={Boolean(working)} onClick={() => void checkpoint()}><Save size={16}/> Save Version</button>
        <button type="button" className="cs3-primary" disabled={Boolean(working) || saveState==='saving' || project.status === "publishing" || project.status === "scheduled"} onClick={() => void markReady()}><Check size={16}/> Ready</button>
        <button type="button" className="cs3-primary" disabled={Boolean(working)||saveState==='saving'||!(["ready", "published", "failed", "needs_manual_finish"] as CreativeStatus[]).includes(project.status)} onClick={() => void renderAssets().then(ok=>{if(ok)router.push(`/admin/publishing?projectId=${project.id}`);})}><Send size={16}/> Publish</button>
      </div>
    </div>

    <div className="cs3-context-bar"><span>PATHWAY <strong>{project.pathwayTitle}</strong></span><span>INTENT <strong>{CREATIVE_INTENT_LABELS[project.intent]}</strong></span><span>FORMAT <strong>{CREATIVE_FORMAT_LABELS[project.format]}</strong></span><span>STATE <strong>v{project.stateVersion}</strong></span></div>

    <CarouselCodePanel key={project.id} open={codeOpen} onOpenChange={setCodeOpen} onSelectFrame={setSelectedFrameId} project={project} selectedId={selectedFrame?.id||project.editorState.frames[0].id} onApply={applyCode} onRestore={restoreCode} onFrame={updateFrame} onCodeFields={(id, patch) => mutateProject(current => {
      const theme = codeTheme(current.editorState) || initialCodeTheme(String(current.editorState.visualSettings.style || "editorial-white"));
      return {...current, editorState: {...current.editorState, visualSettings: {...current.editorState.visualSettings, codeMode: {...theme, overrides: {...theme.overrides, [id]: {...(theme.overrides[id] || {html: "", css: ""}), ...patch}}}}}};
    })} busy={Boolean(working)}/>
    <fieldset disabled={Boolean(working)||project.status!=='draft'} style={{border:0,padding:0,margin:0,minWidth:0}}><div className="cs3-workspace-grid">
      <aside className="cs3-frame-rail">
        <div className="cs3-panel-head"><strong>{project.format === "story" ? "Frames" : project.format === "single" ? "Frame" : "Slides"}</strong>{project.format !== "single" ? <button type="button" aria-label="Add slide" onClick={() => addFrame(selectedFrame?.id)}><Plus size={15}/></button> : null}</div>
        {project.editorState.frames.map((frame, index) => <button type="button" key={frame.id} className={`cs3-frame-row ${frame.id === selectedFrame?.id ? "is-active" : ""}`} onClick={() => setSelectedFrameId(frame.id)}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{frame.headline || frameRoleLabel(frame.role)}</strong><small>{frame.scripture || frameRoleLabel(frame.role)}</small></div></button>)}
        {project.format !== "single" ? <div className="cs3-frame-rail-actions"><button type="button" aria-label="Move slide up" onClick={() => selectedFrame && moveFrame(selectedFrame.id, -1)}><ArrowUp size={14}/></button><button type="button" aria-label="Move slide down" onClick={() => selectedFrame && moveFrame(selectedFrame.id, 1)}><ArrowDown size={14}/></button><button type="button" aria-label="Duplicate slide" onClick={() => selectedFrame && duplicateFrame(selectedFrame.id)}><CopyPlus size={14}/></button><button type="button" aria-label="Delete slide" onClick={() => selectedFrame && deleteFrame(selectedFrame.id)}><Trash2 size={14}/></button></div> : null}
      </aside>

      <main className="cs3-editor-panel">
        {selectedFrame ? <>
          <div className="cs3-panel-head"><div><strong>{project.format === "story" ? "Frame" : project.format === "single" ? "Single Post" : "Slide"} {selectedFrame.order}</strong><small>{frameRoleLabel(selectedFrame.role)}</small></div>{aiReady ? <button type="button" className="cs3-text-action" disabled={Boolean(working)} onClick={() => void runGeneration("regenerate_frame", selectedFrame.id)}>{working === "regenerate_frame" ? <Loader2 size={14} className="spin"/> : <Sparkles size={14}/>} Regenerate frame</button> : null}</div>
          <div className="cs3-form-grid">
            <label>Role<select value={selectedFrame.role} onChange={(event) => updateFrame(selectedFrame.id, { role: event.target.value as CreativeFrame["role"] })}>{["hook","scripture","explanation","support","statement","cta"].map((role) => <option key={role} value={role}>{frameRoleLabel(role as CreativeFrame["role"])}</option>)}</select></label>
            <label>Scripture<input maxLength={180} value={selectedFrame.scripture} onChange={(event) => updateFrame(selectedFrame.id, { scripture: event.target.value })} placeholder="John 1:14"/></label>
            <label className="span-2">Headline<input maxLength={240} value={selectedFrame.headline} onChange={(event) => updateFrame(selectedFrame.id, { headline: event.target.value })}/></label>
            <label className="span-2">Body<textarea maxLength={1400} rows={5} value={selectedFrame.body} onChange={(event) => updateFrame(selectedFrame.id, { body: event.target.value })}/></label>
            <label className="span-2">Overlay text<textarea rows={2} value={selectedFrame.overlayText} onChange={(event) => updateFrame(selectedFrame.id, { overlayText: event.target.value })}/></label>
            <label className="span-2">Supporting notes<textarea rows={3} value={selectedFrame.supportingNotes} onChange={(event) => updateFrame(selectedFrame.id, { supportingNotes: event.target.value })}/></label>
            <label className="span-2">Frame CTA<input value={selectedFrame.cta} onChange={(event) => updateFrame(selectedFrame.id, { cta: event.target.value })}/></label>
          </div>

          <div className="cs3-caption-card">
            <div className="cs3-panel-head"><div><strong>{project.format === "carousel" ? `Slide ${selectedFrame.order} Caption` : "Supporting Caption"}</strong><small>Persistent copy for this frame</small></div><div className="cs3-inline-actions"><button type="button" onClick={() => void copyText(selectedFrame.caption)}><Copy size={14}/> Copy</button>{aiReady ? <button type="button" disabled={Boolean(working)} onClick={() => void generateCaptions("frame")}><Sparkles size={14}/> Regenerate</button> : null}</div></div>
            <textarea rows={5} value={selectedFrame.caption} onChange={(event) => updateFrame(selectedFrame.id, { caption: event.target.value })}/>
            <label>Alt text<textarea rows={2} value={selectedFrame.altText} onChange={(event) => updateFrame(selectedFrame.id, { altText: event.target.value })}/></label>
          </div>
        </> : null}
      </main>

      <aside className="cs3-preview-panel">
        <div className="cs3-panel-head"><strong>Preview</strong><span>{project.format === "story" ? "9:16" : "4:5"}</span></div>
        {selectedFrame && <>
          <div className={styles.canvas}><CarouselPreview input={artworkInput(project,selectedFrame,project.editorState.frames.indexOf(selectedFrame))} onIssues={setIssues}/></div>
          {issues.length>0&&<p className={styles.issues} role="alert">{issues.join(' ')}</p>}
          <div className={styles.toolbar}>
            <button type="button" disabled={!past.length} onClick={()=>travelHistory('undo')}>Undo</button>
            <button type="button" disabled={!future.length} onClick={()=>travelHistory('redo')}>Redo</button>
            <button type="button" disabled={Boolean(working)||issues.length>0} onClick={()=>void downloadFrame()}>Download PNG</button>
            {saveState==='error'&&<button type="button" onClick={()=>void autosaveNow().catch(()=>undefined)}>Retry save</button>}
          </div>
          <CarouselDesignPanel onCustom={()=>setCodeOpen(true)} input={artworkInput(project,selectedFrame,project.editorState.frames.indexOf(selectedFrame))}
            onTheme={theme=>mutateProject(current=>({...current,editorState:{...current.editorState,visualSettings:{...current.editorState.visualSettings,style:theme,...(codeTheme(current.editorState)?{codeMode:{...codeTheme(current.editorState),enabled:false}}:{})}}}))}
            onChange={patch=>updateDesign(selectedFrame.id,patch)} onReset={()=>updateDesign(selectedFrame.id,{},true)}
            onApplyTexture={()=>{const design=frameDesign(project.editorState.visualSettings,selectedFrame.id);mutateProject(current=>({...current,editorState:{...current.editorState,visualSettings:{...current.editorState.visualSettings,frameDesigns:Object.fromEntries(current.editorState.frames.map(frame=>[frame.id,{...frameDesign(current.editorState.visualSettings,frame.id),texture:design.texture,textureStrength:design.textureStrength}]))}}}));}}/>
          <CarouselBackgroundPanel key={selectedFrame.id} projectId={project.id} pathwaySlug={project.pathwaySlug} format={project.format} theme={themeFromSettings(project.editorState.visualSettings)} frame={selectedFrame} totalSlides={project.editorState.frames.length} hasBackground={Boolean(backgrounds[selectedFrame.id])} enabled={aiReady} onDesign={patch=>updateDesign(selectedFrame.id,patch)} onBackground={url=>{setBackgrounds(current=>({...current,[selectedFrame.id]:url}));mutateProject(current=>({...current,editorState:{...current.editorState,visualSettings:{...current.editorState.visualSettings,artworkRevision:Number(current.editorState.visualSettings.artworkRevision||0)+1}}}));}}/>
        </>}
      </aside>
    </div>


    </fieldset>

    <fieldset disabled={Boolean(working)||project.status!=='draft'} style={{border:0,padding:0,margin:0,minWidth:0}}><div className="cs3-lower-grid">
      <section className="cs3-card">
        <div className="cs3-panel-head"><div><strong>Structure</strong><small>Sol can change the sequence without deleting the previous revision.</small></div></div>
        {project.format === "single" ? <p className="cs3-muted">Single Post is exactly one frame.</p> : <><div className="cs3-structure-row"><label>Target {project.format === "story" ? "frames" : "slides"}<input type="number" min={1} max={12} value={structureCount} onChange={(event) => setStructureCount(Math.max(1, Math.min(12, Number(event.target.value))))}/></label><label className="grow">Direction<input value={structureInstruction} onChange={(event) => setStructureInstruction(event.target.value)} placeholder="Add a slide between 3 and 4 explaining John 1:14"/></label><button type="button" className="cs3-secondary" disabled={!aiReady || Boolean(working)} onClick={() => void runGeneration("restructure")}><Sparkles size={15}/> Restructure</button></div><div className="cs3-inline-actions"><button type="button" onClick={() => addFrame()}><Plus size={14}/> Add frame</button><button type="button" disabled={!aiReady || Boolean(working)} onClick={() => void runGeneration("generate")}><Sparkles size={14}/> Regenerate whole creative</button></div></>}
      </section>

      <section className="cs3-card">
        <div className="cs3-panel-head"><div><strong>Unified Caption</strong><small>Written as one continuous post, not stitched slide captions.</small></div><div className="cs3-inline-actions"><button type="button" onClick={() => void copyText(project.unifiedCaption)}><Copy size={14}/> Copy</button>{aiReady ? <button type="button" disabled={Boolean(working)} onClick={() => void generateCaptions("unified")}><Sparkles size={14}/> Regenerate</button> : null}</div></div>
        <textarea rows={8} value={project.unifiedCaption} onChange={(event) => mutateProject((current) => ({ ...current, unifiedCaption: event.target.value }))}/>
        <div className="cs3-inline-actions"><button type="button" disabled={!aiReady || Boolean(working)} onClick={() => void generateCaptions("all")}><Sparkles size={14}/> Generate All Captions</button><button type="button" onClick={() => void copyText(copyAllFrameCaptions(project.editorState.frames))}><Copy size={14}/> Copy All Slide Captions</button></div>
      </section>

      <section className="cs3-card">
        <div className="cs3-panel-head"><div><strong>Project Settings</strong><small>These stay attached through every generation request.</small></div></div>
        <label>Project CTA<input value={project.cta} onChange={(event) => mutateProject((current) => ({ ...current, cta: event.target.value }))} placeholder="Comment JESUS for the pathway"/></label>
        <label>Tags<input value={project.tags.join(", ")} onChange={(event) => mutateProject((current) => ({ ...current, tags: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) }))} placeholder="oneness, jesus, deity"/></label>
        <div className="cs3-asset-summary"><strong>{assets.length}</strong><span>linked Pathway Assets</span></div>
      </section>

      <section className="cs3-card cs3-history-card">
        <div className="cs3-panel-head"><div><strong><FileClock size={16}/> Version History</strong><small>Manual saves and structural generations create checkpoints.</small></div><button type="button" className="cs3-text-action" onClick={() => void duplicateProject()}><CopyPlus size={14}/> Duplicate current</button></div>
        <div className="cs3-checkpoint-row"><input value={checkpointSummary} onChange={(event) => setCheckpointSummary(event.target.value)} placeholder="Changed slides 4–6"/><button type="button" className="cs3-secondary" disabled={Boolean(working)} onClick={() => void checkpoint()}><Save size={14}/> Save</button></div>
        <div className="cs3-version-list">{revisions.length ? revisions.map((revision) => <div className="cs3-version-row" key={revision.id}><div><strong>v{revision.version}</strong><span>{revision.change_summary || revision.reason.replaceAll("_", " ")}</span><small>{new Date(revision.created_at).toLocaleString()}</small></div><div className="cs3-inline-actions"><button type="button" onClick={() => setPreviewRevision(revision)}>Preview</button><button type="button" disabled={Boolean(working)} onClick={() => void restoreRevision(revision.id)}><RotateCcw size={13}/> Restore</button><button type="button" disabled={Boolean(working)} onClick={() => void duplicateProject(revision.id)}><CopyPlus size={13}/> Duplicate</button></div></div>) : <p className="cs3-muted">No checkpoints yet. Autosave protects working state without flooding history.</p>}</div>
      </section>
    </div>

    </fieldset>
    {previewRevision ? <div className="cs3-modal-backdrop" role="presentation" onClick={() => setPreviewRevision(null)}><div className="cs3-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}><div className="cs3-panel-head"><div><strong>Version {previewRevision.version}</strong><small>{previewRevision.change_summary || previewRevision.reason}</small></div><button type="button" onClick={() => setPreviewRevision(null)}>Close</button></div><div className="cs3-revision-preview">{(((previewRevision.snapshot.editorState as Record<string, unknown> | undefined)?.frames as Array<Record<string, unknown>> | undefined) ?? []).map((frame, index) => <div key={index}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{String(frame.headline || "Untitled")}</strong><p>{String(frame.body || "")}</p><small>{String(frame.scripture || "")}</small></div></div>)}</div><div className="cs3-inline-actions"><button type="button" className="cs3-secondary" onClick={() => void restoreRevision(previewRevision.id)}><RotateCcw size={14}/> Restore as latest</button><button type="button" className="cs3-secondary" onClick={() => void duplicateProject(previewRevision.id)}><CopyPlus size={14}/> Duplicate as new project</button></div></div></div> : null}
  </section>;
}
