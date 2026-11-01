"use client";
import { useEffect, useState } from "react";
import type { CreativeEditorState } from "./creative-project";
import { CAROUSEL_THEMES, normalizeCarouselTheme, type CarouselTheme } from "./carousel-theme";
import { COMPOSITIONS, frameDesign, type Composition } from "./carousel-composition";
import styles from "./editorial-engine.module.css";

type Project = {
  id: string; title: string; pathwaySlug: string; intent: string;
  format: "single" | "carousel" | "story"; destination: string;
  stateVersion: number; status: string; editorState: CreativeEditorState;
  unifiedCaption: string; cta: string; tags: string[];
};
type Fields = { headline: string; body: string; scripture: string; cta: string };

export function EditorialDraftControls({ projectId, frameIndex, canManage, onSaved }: {
  projectId: string; frameIndex: number; canManage: boolean; onSaved: () => void;
}) {
  const [project, setProject] = useState<Project | null>(null);
  const [working, setWorking] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [fields, setFields] = useState<Fields>({ headline: "", body: "", scripture: "", cta: "" });
  useEffect(() => {
    let live = true;
    const reset=window.setTimeout(()=>{setProject(null);setError("");setEditing(false);},0);
    void fetch("/api/admin/creative-projects/" + encodeURIComponent(projectId), {cache:"no-store"})
      .then(async r => { const data = await r.json(); if(!r.ok) throw new Error(data.error || "Draft unavailable."); return data.project as Project; })
      .then(p => {if (live) setProject(p);})
      .catch(e => {if (live) setError(e instanceof Error ? e.message : "Draft load failed.");});
    return () => { live = false;window.clearTimeout(reset); };
  }, [projectId]);
  const editable = Boolean(canManage && project && project.status === "draft");
  const frame = project?.editorState.frames[frameIndex] ?? null;
  const chosen = normalizeCarouselTheme(project?.editorState.visualSettings.style || project?.editorState.visualSettings.template);

  async function save(next: Project, message: string) {
    if (!project || working || !editable) return;
    setWorking(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/creative-projects/" + encodeURIComponent(project.id), {
        method:"PATCH", headers:{"content-type":"application/json"},
        body:JSON.stringify({
          expectedStateVersion:project.stateVersion,
          title:next.title,pathwaySlug:next.pathwaySlug,intent:next.intent,format:next.format,
          destination:next.destination,editorState:next.editorState,
          unifiedCaption:next.unifiedCaption,cta:next.cta,tags:next.tags
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Draft save failed.");
      setProject(data.project as Project);
      setNotice(message);
      setEditing(false);
      onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save. Reload to resolve a conflicting edit."); }
    finally {setWorking(false);}
  }
  function choose(theme: CarouselTheme) {
    if (!project || !editable) return;
    void save({...project, editorState:{...project.editorState,
      visualSettings:{...project.editorState.visualSettings,style:theme}
    }}, "Theme saved to your creative project.");
  }
  function regenerate() {
    if(!project || !editable) return;
    const seed=Number(project.editorState.visualSettings.regenerationSeed || 0);
    void save({...project, editorState:{...project.editorState,
      visualSettings:{...project.editorState.visualSettings,regenerationSeed:(seed+1)%10001,frameDesigns:Object.fromEntries(project.editorState.frames.map(item=>[item.id,{...frameDesign(project.editorState.visualSettings,item.id),layout:"automatic"}]))}
    }}, "New artwork variation generated. Scripture and captions are unchanged.");
  }
  function beginEdit() {
    if(!frame || !editable) return;
    setFields({headline:frame.headline,body:frame.body,scripture:frame.scripture,cta:frame.cta});
    setEditing(true);
  }
  function saveFrame() {
    if(!project || !editable || !frame || !fields.headline.trim()) return;
    void save({...project,editorState:{...project.editorState,
      frames:project.editorState.frames.map((item,i)=>i===frameIndex?{...item,
        headline:fields.headline,body:fields.body,scripture:fields.scripture,cta:fields.cta}:item)
    }}, "Frame changes saved. Doctrine and publishing review are still required.");
  }
  return <section className={styles.themePanel} aria-label="14-day artwork direction">
    <h3>Art direction</h3>
    <p>Choose a Carousel Studio look for this draft. Your selection also applies to its exported PNGs.</p>
    <div className={styles.themeGrid}>
      {CAROUSEL_THEMES.map(t=><button type="button" key={t.id}
        disabled={!editable || working || editing} aria-pressed={chosen===t.id}
        className={chosen===t.id?styles.themeSelected:""} onClick={()=>choose(t.id)}>
        <i className={styles.themeSwatch} data-theme={t.id} aria-hidden="true"/>
        <strong>{t.label}</strong><small>{t.detail}</small>
      </button>)}
    </div>
    {frame && <label>Slide composition<select aria-label="Slide composition" disabled={!editable||working||editing} value={frameDesign(project!.editorState.visualSettings,frame.id).layout||'automatic'} onChange={event=>{
      if(!project)return;void save({...project,editorState:{...project.editorState,visualSettings:{...project.editorState.visualSettings,frameDesigns:{...(project.editorState.visualSettings.frameDesigns as Record<string,unknown>||{}),[frame.id]:{...frameDesign(project.editorState.visualSettings,frame.id),layout:event.target.value as Composition}}}}},'Composition saved. Your teaching is unchanged.');
    }}>{COMPOSITIONS.map(layout=><option key={layout}>{layout}</option>)}</select></label>}
    <div className={styles.actions}>
      <button className="button" type="button" disabled={!editable || working || editing} onClick={regenerate}>Regenerate artwork</button>
      <button className="button" type="button" disabled={!editable || !frame || working} onClick={beginEdit}>Edit this frame</button>
    </div>
    {!project && !error && <p>Loading draft editor…</p>}
    {project && !editable && <p>Only draft projects may be changed here. Open the full editor to return approved work to Draft.</p>}
    {notice && <p role="status">{notice}</p>}
    {error && <p role="alert">{error}</p>}
    {editing && <div className={styles.editPanel}>
      <h3>Frame {frameIndex+1} · Edit copy</h3>
      <p>These changes affect this draft only—not the canonical Pathway text.</p>
      <label>Headline<input maxLength={240} value={fields.headline} onChange={e=>setFields(f=>({...f,headline:e.target.value}))}/></label>
      <label>Body<textarea rows={5} maxLength={1400} value={fields.body} onChange={e=>setFields(f=>({...f,body:e.target.value}))}/></label>
      <label>Scripture reference<input maxLength={180} value={fields.scripture} onChange={e=>setFields(f=>({...f,scripture:e.target.value}))}/></label>
      <label>Call to action<input maxLength={500} value={fields.cta} onChange={e=>setFields(f=>({...f,cta:e.target.value}))}/></label>
      <div className={styles.actions}><button type="button" className="button primary" disabled={working||!fields.headline.trim()} onClick={saveFrame}>Save edit</button>
      <button type="button" className="button" disabled={working} onClick={()=>setEditing(false)}>Cancel</button></div>
    </div>}
  </section>;
}
