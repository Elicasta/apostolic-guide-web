"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import {parseCodeDocument} from "./code-mode/core";
import {freshVideoScenes,resolveVideoSceneAnchors,videoSceneHtml,videoSceneTemplates,videoScenesSchema,type VideoScenesDocument,type VideoWord} from "./video-scenes";

type Props={data:VideoScenesDocument;words?:VideoWord[];disabled?:boolean;onApply:(doc:VideoScenesDocument)=>Promise<void>};
export function VideoScenesCodeEditor({data,words=[],disabled=false,onApply}:Props){
 const [value,setValue]=useState<VideoScenesDocument>(data),[raw,setRaw]=useState(JSON.stringify(data,null,2));
 const [tab,setTab]=useState<"fields"|"code">("fields"),[selected,setSelected]=useState(()=>typeof window==="undefined"?"":new URLSearchParams(window.location.search).get("scene")||"");
 const [time,setTime]=useState(0),[playing,setPlaying]=useState(false),[loop,setLoop]=useState(true),[guides,setGuides]=useState(false);
 const [error,setError]=useState(""),[busy,setBusy]=useState(false),[dirty,setDirty]=useState(false),[history,setHistory]=useState<VideoScenesDocument[]>([]);
 const iframe=useRef<HTMLIFrameElement>(null),clock=useRef(0),last=useRef(0);
 const duration=Math.max(1,...value.scenes.map(s=>s.end));
 const fps=value.format.fps,frames=Math.ceil(duration*fps);
 const current=value.scenes.find(s=>s.id===selected)||value.scenes.find(s=>time>=s.start&&time<s.end);
 const safePreview=useMemo(()=>{try{return videoSceneHtml(value,{guides});}catch{return videoSceneHtml(freshVideoScenes(value.kind,value.id),{guides});}},[value,guides]);
 const previewWidth=320,previewHeight=Math.round(previewWidth*value.format.h/value.format.w);
 const scale=previewWidth/value.format.w;
 function update(next:VideoScenesDocument){setHistory(old=>[...old.slice(-29),value]);setValue(next);setRaw(JSON.stringify(next,null,2));setDirty(true);setError("");}
 function editScene(changes:Partial<VideoScenesDocument["scenes"][number]>){if(!current)return;update({...value,scenes:value.scenes.map(s=>s.id===current.id?{...s,...changes}:s)})}
 function step(next:number){const clamped=Math.max(0,Math.min(duration-1/fps,next));setTime(clamped);iframe.current?.contentWindow?.postMessage({type:"ag-seek",time:clamped},"*");}
 useEffect(()=>{iframe.current?.contentWindow?.postMessage({type:"ag-seek",time},"*");},[safePreview,time]);
 useEffect(()=>{if(!playing)return;let id=0;const tick=(ts:number)=>{if(!last.current)last.current=ts;clock.current+=(ts-last.current)/1000;last.current=ts;
 if(clock.current>=duration){clock.current=loop?0:duration-1/fps;if(!loop)setPlaying(false)}
 step(Math.round(clock.current*fps)/fps);id=requestAnimationFrame(tick);};clock.current=time;id=requestAnimationFrame(tick);
 return()=>{cancelAnimationFrame(id);last.current=0};/* time is intentionally captured only at Play */ // eslint-disable-next-line react-hooks/exhaustive-deps
 },[playing,loop,duration,fps]);
 function insertTemplate(templateId:string){const template=videoSceneTemplates.find(t=>t.id===templateId);if(!template)return;
 if(current&&!window.confirm("Replace the selected scene with the "+template.label+" template? This can be undone."))return;
 const scene={id:current?.id||"scene-"+Math.random().toString(36).slice(2,9),start:current?.start??Math.round(time*fps)/fps,end:current?.end??Math.min(duration,Math.round(time*fps)/fps+3),anchor:current?.anchor,layer:template.layer,html:template.html,css:"",keyframes:[],transitionIn:"crossfade" as const,transitionOut:"crossfade" as const,motion:template.motion};
 update({...value,scenes:current?value.scenes.map(s=>s.id===current.id?scene:s):[...value.scenes,scene]});setSelected(scene.id);
 }
 async function apply(){setBusy(true);setError("");try{const parsed=tab==="code"?parseCodeDocument(raw,videoScenesSchema.parse):videoScenesSchema.parse(value);
 await onApply(parsed);setDirty(false);setValue(parsed);setRaw(JSON.stringify(parsed,null,2));}
 catch(e){setError(e instanceof Error?e.message:"Invalid scene document.");}finally{setBusy(false)}}
 const style:React.CSSProperties={background:"#10202A",color:"#F5F7F4",padding:12,borderRadius:10,border:"1px solid #45555f"};
 const button:React.CSSProperties={...style,cursor:"pointer",padding:"8px 12px"};
 return <section aria-label="Video motion Code Mode" style={{display:"grid",gap:16}}>
  <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
   <button type="button" style={button} aria-pressed={tab==="fields"} onClick={()=>setTab("fields")}>Fields</button>
   <button type="button" style={button} aria-pressed={tab==="code"} onClick={()=>setTab("code")}>Code</button>
   <button type="button" style={button} disabled={!history.length||disabled} onClick={()=>{const prev=history.at(-1);if(prev){setHistory(h=>h.slice(0,-1));setValue(prev);setRaw(JSON.stringify(prev,null,2));setDirty(true);}}}>Undo</button>
   <button type="button" style={button} disabled={disabled||busy||!dirty} onClick={()=>void apply()}>Apply JSON</button>
   {dirty?<small>Unapplied edits. Each Apply creates a server checkpoint.</small>:null}
  </div>
  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(310px,1fr))",gap:18,alignItems:"start"}}>
   <div style={{display:"grid",gap:12}}>
    {tab==="code"?<label>Scene document JSON
      <textarea aria-label="Whole-video editable scene JSON" spellCheck={false} value={raw} rows={28} onChange={e=>{setRaw(e.target.value);setDirty(true);setError("");try{setValue(videoScenesSchema.parse(JSON.parse(e.target.value)))}catch{/* partial edits remain in textarea */}}} disabled={disabled} style={{display:"block",width:"100%",background:"#101820",color:"#e5e9ed",font:"13px/1.5 monospace",padding:14,tabSize:2}}/>
     </label>:<>
      <label>Scene<select value={current?.id||""} onChange={e=>setSelected(e.target.value)} style={{width:"100%"}}>{value.scenes.length===0?<option value="">No scenes</option>:null}{value.scenes.map(s=><option key={s.id} value={s.id}>{s.id} · {s.start.toFixed(2)}–{s.end.toFixed(2)}s</option>)}</select></label>
      <label>Template<select defaultValue="" onChange={e=>{if(e.target.value)insertTemplate(e.target.value);e.target.value=""}} disabled={disabled} style={{width:"100%"}}><option value="">Apply template…</option>{videoSceneTemplates.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}</select></label>
      {current?<div style={{display:"grid",gap:12}}>
       <div style={{display:"flex",gap:10}}><label>Start (s)<input type="number" min={0} step={1/fps} value={current.start} onChange={e=>editScene({start:Number(e.target.value)})}/></label><label>End (s)<input type="number" step={1/fps} value={current.end} onChange={e=>editScene({end:Number(e.target.value)})}/></label></div>
       <label>Layer<select value={current.layer} onChange={e=>editScene({layer:e.target.value as typeof current.layer})}>{(["overlay","fullframe","lowerthird"] as const).map(v=><option key={v}>{v}</option>)}</select></label>
       <label>Motion<select value={current.motion} onChange={e=>editScene({motion:e.target.value as typeof current.motion})}>{(["none","words","letters","mask","wipe","rise","slide","punch","highlight","underline","strike"] as const).map(v=><option key={v}>{v}</option>)}</select></label>
       <label>Anchor phrase<input value={current.anchor?.phrase||""} placeholder="Optional spoken phrase" onChange={e=>editScene({anchor:e.target.value?{phrase:e.target.value}:undefined})}/></label>
       <label>Scene HTML<textarea rows={7} value={current.html} onChange={e=>editScene({html:e.target.value})} style={{width:"100%",fontFamily:"monospace"}}/></label>
       <label>Scene CSS<textarea rows={5} value={current.css} onChange={e=>editScene({css:e.target.value})} style={{width:"100%",fontFamily:"monospace"}}/></label>
       <button type="button" onClick={()=>{if(window.confirm("Remove selected scene?")){update({...value,scenes:value.scenes.filter(s=>s.id!==current.id)});setSelected("")}}}>Remove scene</button>
      </div>:<p>Insert a template to begin.</p>}
     </>}
    {error?<div role="alert" style={{color:"#ef8794",whiteSpace:"pre-wrap"}}>{error}</div>:null}
   </div>
   <div style={{display:"grid",gap:12,justifyItems:"center",minWidth:0}}>
    <div style={{...style,padding:8,overflow:"hidden",height:previewHeight+16,width:previewWidth+16}}><iframe ref={iframe} title="Kinetic scene video preview" sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={safePreview} style={{width:value.format.w,height:value.format.h,border:0,transform:`scale(${scale})`,transformOrigin:"top left",background:"#151e26"}}/></div>
    <div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button type="button" style={button} onClick={()=>setPlaying(!playing)}>{playing?"Pause":"Play"}</button><button type="button" style={button} onClick={()=>step(0)}>Restart</button><label><input type="checkbox" checked={loop} onChange={e=>setLoop(e.target.checked)}/> Loop</label><label><input type="checkbox" checked={guides} onChange={e=>setGuides(e.target.checked)}/> Safe areas</label></div>
    <label style={{width:"100%"}}>Frame {Math.round(time*fps)} / {frames} · {time.toFixed(2)}s
      <input type="range" aria-label="Video scrubber" min={0} max={Math.max(0,duration-1/fps)} step={1/fps} value={time} onChange={e=>{setPlaying(false);step(Number(e.target.value))}} style={{width:"100%"}}/></label>
    {words.length?<div aria-label="Word-aligned transcript" style={{display:"flex",flexWrap:"wrap",gap:4,maxHeight:140,overflowY:"auto",width:"100%"}}>{words.slice(0,1000).map((w,i)=><button key={i} type="button" style={{...button,background:time>=w.start&&time<w.end?"#A12D3D":"#10202A",padding:"3px 6px",fontSize:11}} onClick={()=>step(w.start)} title={w.start.toFixed(2)+"s"}>{w.word}</button>)}</div>:<small>Word timing appears when an existing Producer transcript is loaded.</small>}
   </div>
  </div>
 </section>;
}
