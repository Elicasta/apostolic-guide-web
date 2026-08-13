"use client";

import { createClient } from "@supabase/supabase-js";
import {
  AlertTriangle, Archive, ArrowLeft, BookOpen, Check, ChevronRight, Clipboard,
  CloudUpload, Disc3, FileAudio, FileClock, Film, Gauge, History, Loader2,
  Mic2, Music2, Plus, RefreshCw, Save, Sparkles, WandSparkles, X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { SONG_METRIC_LABELS } from "./metrics";
import { SONG_TYPES, type SongAsset, type SongDraft, type SongEvaluation, type SongProject, type SongScoreKey, type SongStyleProfile, type SongType } from "./types";

type View = "write" | "sound" | "release";
type AssetView = SongAsset & { signed_url?: string | null };
type Notice = { kind: "error" | "success"; text: string } | null;

type Props = {
  initialProjects: SongProject[];
  initialStyles: SongStyleProfile[];
  userLabel: string;
  setupError?: string | null;
};

const EMPTY_LYRICS = `[Verse 1]\n\n[Chorus]\n\n[Verse 2]\n\n[Bridge]\n`;

function prettyType(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function statusLabel(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function projectFromState(project: SongProject, state: EditorState): Partial<SongProject> {
  return {
    title: state.title || "Untitled Song",
    working_title: state.title || "Untitled Song",
    song_type: state.songType,
    theological_center: state.theologicalCenter,
    core_scriptures: state.scriptures.split(",").map((item) => item.trim()).filter(Boolean),
    audience_context: state.audienceContext,
    desired_tone: state.desiredTone,
    creative_brief: state.creativeBrief,
    style_profile_id: state.styleId || null,
    distribution_metadata: project.distribution_metadata
  };
}

type EditorState = {
  title: string;
  songType: SongType;
  theologicalCenter: string;
  scriptures: string;
  audienceContext: string;
  desiredTone: string;
  creativeBrief: string;
  styleId: string;
  lyrics: string;
  draftId: string | null;
  evaluation: SongEvaluation | null;
};

function editorStateFor(project: SongProject | null): EditorState {
  if (!project) {
    return {
      title: "", songType: "declaration", theologicalCenter: "", scriptures: "",
      audienceContext: "Congregational church worship", desiredTone: "Scripture-rich, reverent, singable",
      creativeBrief: "", styleId: "", lyrics: EMPTY_LYRICS, draftId: null, evaluation: null
    };
  }
  return {
    title: project.working_title || project.title,
    songType: project.song_type,
    theologicalCenter: project.theological_center,
    scriptures: project.core_scriptures.join(", "),
    audienceContext: project.audience_context,
    desiredTone: project.desired_tone,
    creativeBrief: project.creative_brief,
    styleId: project.style_profile_id ?? "",
    lyrics: project.current_draft?.lyrics || EMPTY_LYRICS,
    draftId: project.current_draft_id,
    evaluation: project.current_draft?.evaluation ?? null
  };
}

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status}).`);
  return payload as T;
}

function ScoreRail({ evaluation }: { evaluation: SongEvaluation | null }) {
  if (!evaluation) {
    return (
      <aside className="song-score-panel">
        <div className="panel-kicker"><Gauge size={15} /> Quality gate</div>
        <div className="score-empty">
          <span>NO REVIEW</span>
          <p>Generate or evaluate a saved draft to score theology, Scripture, singability, originality, and Suno readiness.</p>
        </div>
      </aside>
    );
  }

  const gate = evaluation.gate_status;
  return (
    <aside className="song-score-panel">
      <div className="panel-kicker"><Gauge size={15} /> Quality gate</div>
      <div className={`score-total score-total-${gate}`}>
        <strong>{evaluation.overall_score}</strong>
        <span>/100</span>
        <small>{gate === "ready_for_suno" ? "CLEARED FOR SUNO" : gate === "blocked" ? "BLOCKED" : "NEEDS WORK"}</small>
      </div>
      <div className="score-list">
        {Object.entries(evaluation.scores).map(([key, score]) => (
          <div className="score-row" key={key}>
            <div><span>{SONG_METRIC_LABELS[key as SongScoreKey]}</span><b>{score}</b></div>
            <div className="score-track"><i style={{ width: `${score}%` }} /></div>
          </div>
        ))}
      </div>
      {evaluation.issues.length > 0 && (
        <div className="review-notes">
          <h4>Review notes</h4>
          {evaluation.issues.slice(0, 5).map((issue, index) => (
            <div className={`review-note review-${issue.severity}`} key={`${issue.note}-${index}`}>
              <span>{issue.severity}</span>
              <p>{issue.note}</p>
              {issue.suggested_direction && <small>{issue.suggested_direction}</small>}
            </div>
          ))}
        </div>
      )}
      {evaluation.mechanics?.warnings?.length ? (
        <div className="mechanics-notes">
          <h4>Mechanical flags</h4>
          {evaluation.mechanics.warnings.map((warning) => <p key={warning}>{warning}</p>)}
        </div>
      ) : null}
    </aside>
  );
}

export function SongStudioApp({ initialProjects, initialStyles, userLabel, setupError = null }: Props) {
  const [projects, setProjects] = useState(initialProjects);
  const [styles, setStyles] = useState(initialStyles);
  const [selectedId, setSelectedId] = useState(initialProjects[0]?.id ?? null);
  const selectedProject = useMemo(() => projects.find((project) => project.id === selectedId) ?? null, [projects, selectedId]);
  const [editor, setEditor] = useState<EditorState>(() => editorStateFor(initialProjects[0] ?? null));
  const [view, setView] = useState<View>("write");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(setupError ? { kind: "error", text: setupError } : null);
  const [dirty, setDirty] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [drafts, setDrafts] = useState<SongDraft[]>([]);
  const [refineInstruction, setRefineInstruction] = useState("");
  const [assets, setAssets] = useState<AssetView[]>([]);
  const [assetType, setAssetType] = useState<SongAsset["asset_type"]>("video");
  const [assetFinal, setAssetFinal] = useState(true);
  const [externalUrl, setExternalUrl] = useState("");
  const [newStyle, setNewStyle] = useState({ name: "", family: "", vocal: "", instruments: "", prompt: "", avoid: "" });
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditor(editorStateFor(selectedProject));
    setDirty(false);
    setHistoryOpen(false);
    setDrafts([]);
    setAssets([]);
    setNotice(null);
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  function updateEditor<K extends keyof EditorState>(key: K, value: EditorState[K]) {
    setEditor((current) => ({ ...current, [key]: value }));
    setDirty(true);
  }

  const reviewDirty = Boolean(selectedProject && (
    selectedProject.current_draft?.lyrics !== editor.lyrics
    || selectedProject.theological_center !== editor.theologicalCenter
    || selectedProject.song_type !== editor.songType
    || selectedProject.core_scriptures.join(", ") !== editor.scriptures
  ));

  async function reload() {
    const payload = await jsonRequest<{ projects: SongProject[]; styles: SongStyleProfile[] }>("/api/media/song-studio/projects");
    setProjects(payload.projects);
    setStyles(payload.styles);
    if (selectedId) {
      const fresh = payload.projects.find((project) => project.id === selectedId);
      if (fresh) {
        setEditor(editorStateFor(fresh));
        setDirty(false);
      }
    }
  }

  async function createProject() {
    setBusy("new");
    setNotice(null);
    try {
      const payload = await jsonRequest<{ project: SongProject }>("/api/media/song-studio/projects", {
        method: "POST",
        body: JSON.stringify({ title: "Untitled Song", song_type: "declaration" })
      });
      setProjects((current) => [payload.project, ...current]);
      setSelectedId(payload.project.id);
      setEditor(editorStateFor(payload.project));
      setView("write");
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not create song." });
    } finally { setBusy(null); }
  }

  async function saveProjectBrief(silent = false) {
    if (!selectedProject) return null;
    const changes = projectFromState(selectedProject, editor);
    const payload = await jsonRequest<{ project: SongProject }>("/api/media/song-studio/projects", {
      method: "PATCH",
      body: JSON.stringify({ id: selectedProject.id, ...changes })
    });
    setProjects((current) => current.map((project) => project.id === selectedProject.id ? { ...project, ...payload.project } : project));
    if (!silent) setNotice({ kind: "success", text: "Song brief saved." });
    return payload.project;
  }

  async function saveDraft() {
    if (!selectedProject || !editor.lyrics.trim()) return null;
    setBusy("save");
    setNotice(null);
    try {
      await saveProjectBrief(true);
      const payload = await jsonRequest<{ draft: SongDraft }>("/api/media/song-studio/drafts", {
        method: "POST",
        body: JSON.stringify({
          project_id: selectedProject.id,
          title: editor.title || "Untitled Song",
          lyrics: editor.lyrics,
          source: editor.draftId ? "hybrid" : "human"
        })
      });
      setEditor((current) => ({ ...current, draftId: payload.draft.id, evaluation: null }));
      setDirty(false);
      setNotice({ kind: "success", text: `Draft v${payload.draft.version} saved.` });
      await reload();
      return payload.draft;
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not save draft." });
      return null;
    } finally { setBusy(null); }
  }

  async function runAI(action: "write" | "refine" | "evaluate" | "suno_prompt") {
    if (!selectedProject) return;
    setBusy(action);
    setNotice(null);
    try {
      await saveProjectBrief(true);
      let draftId = editor.draftId;
      if (action === "evaluate" && (reviewDirty || !draftId)) {
        const saved = await saveDraft();
        draftId = saved?.id ?? null;
        if (!draftId) return;
        setBusy(action);
      }
      const payload = await jsonRequest<{
        draft?: SongDraft;
        evaluation?: SongEvaluation;
        project?: SongProject;
        suno?: { style_prompt: string; production_notes: string; negative_style_notes: string[]; bpm_min: number; bpm_max: number };
      }>("/api/media/song-studio/ai", {
        method: "POST",
        body: JSON.stringify({
          action,
          project_id: selectedProject.id,
          draft_id: draftId ?? undefined,
          lyrics: action === "refine" ? editor.lyrics : undefined,
          instruction: action === "refine" ? refineInstruction : undefined
        })
      });

      if (payload.draft) {
        setEditor((current) => ({
          ...current,
          title: payload.draft!.title,
          lyrics: payload.draft!.lyrics,
          draftId: payload.draft!.id,
          evaluation: payload.evaluation ?? null
        }));
        setDirty(false);
      } else if (payload.evaluation) {
        setEditor((current) => ({ ...current, evaluation: payload.evaluation! }));
      }
      if (action === "refine") setRefineInstruction("");
      if (action === "suno_prompt") {
        setNotice({ kind: "success", text: "Suno production metadata prepared from the cleared draft." });
        setView("sound");
      } else {
        const gate = payload.evaluation?.gate_status;
        setNotice({
          kind: gate === "blocked" ? "error" : "success",
          text: gate === "ready_for_suno" ? "Draft cleared the quality gate." : gate === "blocked" ? "Draft saved, but theology or worship-quality blockers remain." : "Draft and review saved. It still needs work before Suno."
        });
      }
      await reload();
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "AI request failed." });
    } finally { setBusy(null); }
  }

  async function loadHistory() {
    if (!selectedProject) return;
    setHistoryOpen(true);
    setBusy("history");
    try {
      const payload = await jsonRequest<{ drafts: SongDraft[] }>(`/api/media/song-studio/drafts?projectId=${selectedProject.id}`);
      setDrafts(payload.drafts);
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not load history." });
    } finally { setBusy(null); }
  }

  function loadDraftIntoEditor(draft: SongDraft) {
    setEditor((current) => ({ ...current, title: draft.title, lyrics: draft.lyrics, draftId: draft.id, evaluation: draft.evaluation ?? null }));
    setDirty(false);
    setHistoryOpen(false);
  }

  async function createStyle() {
    if (!newStyle.name.trim()) return;
    setBusy("style");
    try {
      const slug = newStyle.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const payload = await jsonRequest<{ style: SongStyleProfile }>("/api/media/song-studio/styles", {
        method: "POST",
        body: JSON.stringify({
          name: newStyle.name,
          slug,
          description: "Custom Song Studio palette",
          musical_family: newStyle.family,
          vocal_texture: newStyle.vocal,
          instrumentation: newStyle.instruments.split(",").map((item) => item.trim()).filter(Boolean),
          energy: 60,
          congregation_fit: 85,
          suno_style_prompt: newStyle.prompt,
          negative_style_notes: newStyle.avoid.split(",").map((item) => item.trim()).filter(Boolean)
        })
      });
      setStyles((current) => [...current, payload.style]);
      updateEditor("styleId", payload.style.id);
      setNewStyle({ name: "", family: "", vocal: "", instruments: "", prompt: "", avoid: "" });
      setNotice({ kind: "success", text: `Saved style “${payload.style.name}”.` });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not save style." });
    } finally { setBusy(null); }
  }

  async function loadAssets() {
    if (!selectedProject) return;
    setBusy("assets");
    try {
      const payload = await jsonRequest<{ assets: AssetView[] }>(`/api/media/song-studio/assets?projectId=${selectedProject.id}`);
      setAssets(payload.assets);
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not load assets." });
    } finally { setBusy(null); }
  }

  useEffect(() => {
    if (view === "release" && selectedProject) void loadAssets();
  }, [view, selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function uploadFile(file: File) {
    if (!selectedProject) return;
    setBusy("upload");
    setNotice(null);
    try {
      const signed = await jsonRequest<{ bucket: string; path: string; token: string }>("/api/media/song-studio/assets", {
        method: "POST",
        body: JSON.stringify({
          action: "sign",
          project_id: selectedProject.id,
          asset_type: assetType,
          file_name: file.name,
          mime_type: file.type,
          file_size_bytes: file.size
        })
      });
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !key) throw new Error("Supabase browser configuration is missing.");
      const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
      const uploaded = await supabase.storage.from(signed.bucket).uploadToSignedUrl(signed.path, signed.token, file, { contentType: file.type });
      if (uploaded.error) throw uploaded.error;
      await jsonRequest("/api/media/song-studio/assets", {
        method: "POST",
        body: JSON.stringify({
          action: "register",
          project_id: selectedProject.id,
          asset_type: assetType,
          storage_path: signed.path,
          mime_type: file.type,
          file_size_bytes: file.size,
          is_final: assetFinal,
          metadata: { original_name: file.name }
        })
      });
      setNotice({ kind: "success", text: `${file.name} uploaded and attached to the song.` });
      if (fileRef.current) fileRef.current.value = "";
      await loadAssets();
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Upload failed." });
    } finally { setBusy(null); }
  }

  async function attachExternal() {
    if (!selectedProject || !externalUrl.trim()) return;
    setBusy("external");
    try {
      await jsonRequest("/api/media/song-studio/assets", {
        method: "POST",
        body: JSON.stringify({ action: "external", project_id: selectedProject.id, asset_type: assetType, external_url: externalUrl.trim(), is_final: assetFinal })
      });
      setExternalUrl("");
      setNotice({ kind: "success", text: "External production asset attached." });
      await loadAssets();
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not attach URL." });
    } finally { setBusy(null); }
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    setNotice({ kind: "success", text: "Copied." });
  }

  const currentStyle = styles.find((style) => style.id === editor.styleId) ?? null;
  const canSuno = editor.evaluation?.gate_status === "ready_for_suno" && !reviewDirty;

  return (
    <div className="song-studio-shell">
      <aside className="song-library">
        <div className="studio-brand">
          <a href="/media" aria-label="Back to Apostolic Guide media"><ArrowLeft size={16} /></a>
          <div><span>APOSTOLIC GUIDE / MEDIA</span><strong>SONG STUDIO</strong></div>
        </div>
        <button className="new-song" onClick={createProject} disabled={busy === "new"}><Plus size={17} /> New song</button>
        <div className="library-label"><span>SONGS</span><small>{projects.length}</small></div>
        <nav className="song-list" aria-label="Song projects">
          {projects.map((project) => (
            <button key={project.id} className={project.id === selectedId ? "active" : ""} onClick={() => setSelectedId(project.id)}>
              <span className={`status-dot status-${project.status}`} />
              <div><strong>{project.working_title || project.title}</strong><small>{prettyType(project.song_type)} · {statusLabel(project.status)}</small></div>
              <ChevronRight size={14} />
            </button>
          ))}
          {!projects.length && <p className="library-empty">No songs yet. Start with a doctrine, passage, or worship idea.</p>}
        </nav>
        <div className="studio-user"><span>{userLabel}</span><small>Creative workspace</small></div>
      </aside>

      <main className="song-workspace">
        <header className="studio-topbar">
          <div>
            <span className="topbar-kicker">MEDIA / SONGS / {selectedProject ? statusLabel(selectedProject.status).toUpperCase() : "NEW"}</span>
            <input className="song-title-input" aria-label="Song title" value={editor.title} disabled={!selectedProject} onChange={(event) => updateEditor("title", event.target.value)} placeholder="Untitled Song" />
          </div>
          <div className="topbar-actions">
            {dirty && <span className="dirty-mark">UNSAVED</span>}
            <button className="studio-button ghost" onClick={loadHistory} disabled={!selectedProject || Boolean(busy)}><History size={16} /> Versions</button>
            <button className="studio-button" onClick={() => void saveDraft()} disabled={!selectedProject || Boolean(busy)}>{busy === "save" ? <Loader2 className="spin" size={16} /> : <Save size={16} />} Save draft</button>
          </div>
        </header>

        <div className="studio-tabs" role="tablist">
          <button className={view === "write" ? "active" : ""} onClick={() => setView("write")}><BookOpen size={15} /> Write</button>
          <button className={view === "sound" ? "active" : ""} onClick={() => setView("sound")}><Disc3 size={15} /> Sound + Suno</button>
          <button className={view === "release" ? "active" : ""} onClick={() => setView("release")}><Film size={15} /> Masters + release</button>
        </div>

        {notice && <div className={`studio-notice ${notice.kind}`}><span>{notice.kind === "error" ? <AlertTriangle size={16} /> : <Check size={16} />}{notice.text}</span><button onClick={() => setNotice(null)} aria-label="Dismiss"><X size={15} /></button></div>}

        {!selectedProject ? (
          <section className="empty-workspace">
            <Mic2 size={42} />
            <h1>Write songs the church does not have to edit.</h1>
            <p>Start with one theological center. Song Studio keeps the Scripture, drafts, style, review history, Suno metadata, and final masters together.</p>
            <button className="studio-button primary" onClick={createProject}><Plus size={17} /> Create first song</button>
          </section>
        ) : view === "write" ? (
          <div className="write-grid">
            <section className="song-editor-column">
              <div className="brief-grid">
                <label><span>SONG TYPE</span><select value={editor.songType} onChange={(event) => updateEditor("songType", event.target.value as SongType)}>{SONG_TYPES.map((type) => <option key={type} value={type}>{prettyType(type)}</option>)}</select></label>
                <label className="wide"><span>THEOLOGICAL CENTER</span><input value={editor.theologicalCenter} onChange={(event) => updateEditor("theologicalCenter", event.target.value)} placeholder="Example: Jesus Christ is the visible revelation of the invisible God." /></label>
                <label className="wide"><span>CORE SCRIPTURES</span><input value={editor.scriptures} onChange={(event) => updateEditor("scriptures", event.target.value)} placeholder="Colossians 1:15, John 14:9, Hebrews 1:3" /></label>
                <label><span>CONTEXT</span><input value={editor.audienceContext} onChange={(event) => updateEditor("audienceContext", event.target.value)} /></label>
                <label><span>TONE</span><input value={editor.desiredTone} onChange={(event) => updateEditor("desiredTone", event.target.value)} /></label>
                <label className="wide"><span>CREATIVE BRIEF</span><textarea value={editor.creativeBrief} onChange={(event) => updateEditor("creativeBrief", event.target.value)} placeholder="What should this song feel like? What should it avoid? What moment in church should it serve?" /></label>
              </div>

              <div className="ai-command-bar">
                <div><Sparkles size={16} /><span><strong>SOL 5.6</strong><small>Write against the Apostolic Song Standard, then run the quality gate.</small></span></div>
                <button className="studio-button primary" onClick={() => runAI("write")} disabled={Boolean(busy) || !editor.theologicalCenter.trim()}>{busy === "write" ? <Loader2 className="spin" size={16} /> : <WandSparkles size={16} />} Write from brief</button>
              </div>

              <div className="lyrics-paper">
                <div className="lyrics-toolbar"><span>LYRICS</span><div><small>{editor.lyrics.split(/\n/).filter((line) => line.trim()).length} lines</small><button onClick={() => copy(editor.lyrics)}><Clipboard size={14} /> Copy</button></div></div>
                <textarea className="lyrics-editor" value={editor.lyrics} onChange={(event) => updateEditor("lyrics", event.target.value)} spellCheck />
              </div>

              <div className="refine-bar">
                <input value={refineInstruction} onChange={(event) => setRefineInstruction(event.target.value)} placeholder="Refine without flattening it. Example: Make the chorus more congregational; keep verse 2 theology intact." />
                <button className="studio-button" onClick={() => runAI("refine")} disabled={Boolean(busy) || !refineInstruction.trim()}>{busy === "refine" ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />} Refine</button>
                <button className="studio-button ghost" onClick={() => runAI("evaluate")} disabled={Boolean(busy) || !editor.lyrics.trim()}>{busy === "evaluate" ? <Loader2 className="spin" size={16} /> : <Gauge size={16} />} Re-score</button>
              </div>
            </section>
            <ScoreRail evaluation={editor.evaluation} />
          </div>
        ) : view === "sound" ? (
          <section className="sound-view">
            <div className="sound-heading"><div><span className="topbar-kicker">MUSICAL LANGUAGE</span><h2>Give the lyric a world, not an artist clone.</h2><p>Style profiles become reusable production data. Pick one, alter the brief, or save a new palette.</p></div><button className="studio-button primary" disabled={!canSuno || Boolean(busy)} onClick={() => runAI("suno_prompt")}>{busy === "suno_prompt" ? <Loader2 className="spin" size={16} /> : <Sparkles size={16} />} Prepare for Suno</button></div>
            {!canSuno && <div className="gate-warning"><AlertTriangle size={17} /><div><strong>{reviewDirty ? "The cleared draft has changed." : "Suno prep is locked."}</strong><p>{reviewDirty ? "Save and re-score the lyric or theology changes before preparing production metadata. Style and title changes do not require a new theological review." : "The current draft must clear the theological and congregational quality gate first."}</p></div></div>}
            <div className="style-grid">
              {styles.map((style) => (
                <button key={style.id} className={`style-card ${editor.styleId === style.id ? "active" : ""}`} onClick={() => updateEditor("styleId", style.id)}>
                  <div><span>{style.is_system ? "STUDIO PALETTE" : "CUSTOM"}</span>{editor.styleId === style.id && <Check size={16} />}</div>
                  <h3>{style.name}</h3><p>{style.description}</p>
                  <dl><div><dt>Family</dt><dd>{style.musical_family}</dd></div><div><dt>Vocal</dt><dd>{style.vocal_texture}</dd></div><div><dt>Tempo</dt><dd>{style.tempo_min ?? "?"}-{style.tempo_max ?? "?"}</dd></div><div><dt>Church fit</dt><dd>{style.congregation_fit}</dd></div></dl>
                </button>
              ))}
            </div>
            <div className="suno-panel">
              <div className="panel-heading"><div><span>SUNO PACKAGE</span><h3>{currentStyle?.name ?? "No style selected"}</h3></div><button onClick={() => copy(selectedProject.suno_style_prompt || currentStyle?.suno_style_prompt || "")}><Clipboard size={15} /> Copy style</button></div>
              <label><span>STYLE PROMPT</span><textarea readOnly value={selectedProject.suno_style_prompt || currentStyle?.suno_style_prompt || "Clear the song quality gate, then prepare the Suno package."} /></label>
              <div className="suno-two"><label><span>PRODUCTION NOTES</span><textarea readOnly value={selectedProject.suno_production_notes} /></label><label><span>AVOID</span><textarea readOnly value={selectedProject.suno_negative_prompt || currentStyle?.negative_style_notes.join(", ") || ""} /></label></div>
            </div>
            <div className="custom-style-panel">
              <div><span className="topbar-kicker">SAVE A PALETTE</span><h3>Custom style</h3><p>Store musical language you want to reuse across songs.</p></div>
              <div className="custom-style-fields">
                <input placeholder="Style name" value={newStyle.name} onChange={(e) => setNewStyle((s) => ({ ...s, name: e.target.value }))} />
                <input placeholder="Musical family" value={newStyle.family} onChange={(e) => setNewStyle((s) => ({ ...s, family: e.target.value }))} />
                <input placeholder="Vocal texture" value={newStyle.vocal} onChange={(e) => setNewStyle((s) => ({ ...s, vocal: e.target.value }))} />
                <input placeholder="Instrumentation, comma separated" value={newStyle.instruments} onChange={(e) => setNewStyle((s) => ({ ...s, instruments: e.target.value }))} />
                <textarea placeholder="Suno style language" value={newStyle.prompt} onChange={(e) => setNewStyle((s) => ({ ...s, prompt: e.target.value }))} />
                <input placeholder="Avoid, comma separated" value={newStyle.avoid} onChange={(e) => setNewStyle((s) => ({ ...s, avoid: e.target.value }))} />
              </div>
              <button className="studio-button" onClick={createStyle} disabled={busy === "style" || !newStyle.name.trim()}>{busy === "style" ? <Loader2 className="spin" size={16} /> : <Save size={16} />} Save style</button>
            </div>
          </section>
        ) : (
          <section className="release-view">
            <div className="release-heading"><div><span className="topbar-kicker">PRODUCTION LIBRARY</span><h2>From Suno render to final master.</h2><p>Keep source audio, mixes, masters, artwork, stems, and the final MP4 attached to the song that created them.</p></div><button className="studio-button ghost" onClick={loadAssets} disabled={busy === "assets"}><RefreshCw size={16} /> Refresh</button></div>
            <div className="upload-panel">
              <div className="upload-options"><label><span>ASSET TYPE</span><select value={assetType} onChange={(e) => setAssetType(e.target.value as SongAsset["asset_type"])}><option value="suno_audio">Suno audio</option><option value="mix">Mix</option><option value="master">Master</option><option value="cover">Cover art</option><option value="video">Final MP4 / video</option><option value="stems">Stems ZIP</option><option value="other">Other</option></select></label><label className="final-check"><input type="checkbox" checked={assetFinal} onChange={(e) => setAssetFinal(e.target.checked)} /><span>Mark as final candidate</span></label></div>
              <button className="dropzone" onClick={() => fileRef.current?.click()} disabled={busy === "upload"}>{busy === "upload" ? <Loader2 className="spin" size={30} /> : <CloudUpload size={30} />}<strong>Upload production file</strong><span>Audio, MP4, cover art, or stems. Upload goes directly to private storage.</span></button>
              <input ref={fileRef} type="file" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadFile(file); }} />
              <div className="external-asset"><input type="url" placeholder="Or attach a Suno / distribution asset URL" value={externalUrl} onChange={(e) => setExternalUrl(e.target.value)} /><button className="studio-button" disabled={!externalUrl.trim() || busy === "external"} onClick={attachExternal}>Attach URL</button></div>
            </div>
            <div className="asset-list">
              <div className="library-label"><span>ASSETS</span><small>{assets.length}</small></div>
              {assets.map((asset) => (
                <a className="asset-row" key={asset.id} href={asset.signed_url || asset.external_url || "#"} target="_blank" rel="noreferrer">
                  <span className="asset-icon">{asset.asset_type === "video" ? <Film size={18} /> : asset.asset_type === "cover" ? <Music2 size={18} /> : <FileAudio size={18} />}</span>
                  <div><strong>{asset.metadata?.original_name ? String(asset.metadata.original_name) : prettyType(asset.asset_type)}</strong><small>{prettyType(asset.asset_type)} · {new Date(asset.created_at).toLocaleString()}</small></div>
                  {asset.is_final && <b>FINAL</b>}
                  <ChevronRight size={16} />
                </a>
              ))}
              {!assets.length && <div className="assets-empty"><Archive size={26} /><p>No production files attached yet.</p></div>}
            </div>
          </section>
        )}
      </main>

      {historyOpen && (
        <div className="history-drawer" role="dialog" aria-modal="true" aria-label="Song version history">
          <div className="history-head"><div><FileClock size={18} /><span><strong>Version history</strong><small>Immutable snapshots</small></span></div><button onClick={() => setHistoryOpen(false)} aria-label="Close"><X size={17} /></button></div>
          <div className="history-list">
            {busy === "history" && <div className="history-loading"><Loader2 className="spin" size={22} /></div>}
            {drafts.map((draft) => (
              <button key={draft.id} onClick={() => loadDraftIntoEditor(draft)}>
                <div><strong>v{draft.version} · {draft.title}</strong><small>{new Date(draft.created_at).toLocaleString()} · {draft.source}</small></div>
                {draft.evaluation && <span className={`history-score ${draft.evaluation.gate_status}`}>{draft.evaluation.overall_score}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
