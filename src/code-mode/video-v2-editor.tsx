"use client";

import {useEffect,useMemo,useRef,useState} from "react";
import {parseCodeDocument} from "./core";
import {VIDEO_SCENE_TEMPLATES,insertVideoTemplate,videoCodeV2Schema,videoFrameHtml,resolveVideoSceneAnchors,type VideoCodeV2} from "./video-v2";

type Word={word?:string;text?:string;start?:number;end?:number};
type GraphicAsset={id:string;title:string;previewUrl:string;contentType:string};
type Props={value:VideoCodeV2;onApply:(next:VideoCodeV2)=>Promise<void>;disabled?:boolean;readOnly?:boolean;words?:Word[];initialScene?:string};
const inputStyle={width:"100%",padding:10,background:"#0e1820",color:"#f5f7f4",border:"1px solid #405360",borderRadius:7} as const;
const btnStyle={padding:"8px 12px",border:"1px solid #617080",borderRadius:8,color:"inherit",background:"#1c303b"} as const;
function highlight(raw:string){
 const esc=(t:string)=>t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
 return esc(raw).replace(/("(?:\\.|[^"\\])*")(?=\s*:)|("(?:\\.|[^"\\])*")|\b(true|false|null)\b|(-?\d+(?:\.\d+)?)/g,(_m,key,value,keyword)=>`<span style="color:${key?"#8acee6":value?"#f4bb93":keyword?"#c6a0dc":"#a5d6a7"}">${_m}</span>`);
}
function fmt(n:number){const m=Math.floor(n/60),s=(n%60).toFixed(1).padStart(4,"0");return `${m}:${s}`;}
export function VideoCodeEditor({value,onApply,disabled=false,readOnly=false,words=[],initialScene=""}:Props){
 const [raw,setRaw]=useState(()=>JSON.stringify(value,null,2));
 const [tab,setTab]=useState<"fields"|"code">("fields");
 const [error,setError]=useState("");
 const [time,setTime]=useState(0);
 const [playing,setPlaying]=useState(false);
 const [loop,setLoop]=useState(false);
 const [guides,setGuides]=useState(true);
 const [sceneId,setSceneId]=useState(value.scenes.find(s=>s.id===initialScene)?.id||value.scenes[0]?.id||"");
 const [template,setTemplate]=useState<string>(VIDEO_SCENE_TEMPLATES[0].id);
 const [undo,setUndo]=useState<string[]>([]);
 const [busy,setBusy]=useState(false);
 const [graphics,setGraphics]=useState<GraphicAsset[]>([]);
 const [graphicId,setGraphicId]=useState("");
 const editorRef=useRef<HTMLTextAreaElement>(null);
 const codeRef=useRef<HTMLPreElement>(null);
 const parsed=useMemo(()=>{try{return parseCodeDocument(raw,(v)=>videoCodeV2Schema.parse(v));}catch{return null;}},[raw]);
 const document=parsed||value;
 const duration=Math.max(5,...document.scenes.map(s=>s.end));
 const active=useMemo(()=>document.scenes.find(s=>s.id===sceneId),[document,sceneId]);
 const valid=parsed!==null;
 const maxWidth=document.format.h>document.format.w?330:660;
 const scale=Math.min(1,maxWidth/document.format.w);
 const ready=!disabled&&!readOnly;
 function update(next:VideoCodeV2){if(!ready)return;setUndo(h=>[...h.slice(-29),raw]);setRaw(JSON.stringify(next,null,2));setError("");}
 function updateScene(patch:Record<string,unknown>){if(!active)return;update({...document,scenes:document.scenes.map(s=>s.id===sceneId?{...s,...patch}:s)});}
 function insert(){if(!ready)return;
   const item=VIDEO_SCENE_TEMPLATES.find(t=>t.id===template);if(!item)return;
   if(document.scenes.some(s=>s.id===item.id)&&!window.confirm("Insert another scene using this template? Existing scenes will be preserved."))return;
   const next=insertVideoTemplate(document,item,Math.min(time,duration));
   setSceneId(next.scenes[next.scenes.length-1].id);update(next);
 }
 async function apply(){
   if(!ready)return;
   setBusy(true);setError("");
   try {const parsed=parseCodeDocument(raw,(v)=>videoCodeV2Schema.parse(v));await onApply(parsed);}
   catch(e){setError(e instanceof Error?e.message:String(e));}
   finally{setBusy(false);}
 }
 useEffect(()=>{if(!playing)return;let frame=0,last=performance.now();const tick=(now:number)=>{
    const delta=(now-last)/1000;last=now;
    setTime(t=>{const next=t+delta;if(next>=duration){if(loop)return 0;setPlaying(false);return duration-.001;}return next;});
    frame=requestAnimationFrame(tick);
   };frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);
 },[playing,duration,loop]);
 useEffect(()=>{let mounted=true;
   fetch("/api/admin/video-producer/graphics",{cache:"no-store"})
    .then(async res=>res.ok?res.json():{assets:[]})
    .then(data=>{if(mounted)setGraphics((data.assets||[]).filter((a:GraphicAsset)=>["image/png","image/jpeg","image/webp"].includes(a.contentType)));})
    .catch(()=>{if(mounted)setGraphics([]);});
   return ()=>{mounted=false;};
 },[]);
 const assetSources=Object.fromEntries(graphics.map(a=>["graphic-"+a.id,a.previewUrl]));
 function insertGraphic(){
   if(!ready||!active||!graphicId)return;
   const graphic=graphics.find(a=>a.id===graphicId);if(!graphic)return;
   const key="graphic-"+graphic.id;
   const exists=document.assets.some(a=>a.id===key);
   update({...document,assets:exists?document.assets:[...document.assets,{id:key,kind:"graphic"}],
      scenes:document.scenes.map(s=>s.id===sceneId?{...s,html:s.html+'<ag-asset data-id="'+key+'"></ag-asset>'}:s)});
 }
 const visibleWords=words.filter(w=>Number(w.start||0)<=time+2&&Number(w.end||0)>=time-2).slice(0,35);
 return <div style={{display:"grid",gap:16,gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,340px),1fr))"}}>
  <div style={{display:"grid",gap:12,minWidth:0,alignContent:"start"}}>
   <div role="tablist" aria-label="Video Code Mode views" style={{display:"flex",gap:6}}>
    {(["fields","code"] as const).map(t=><button key={t} type="button" role="tab" aria-selected={tab===t} onClick={()=>setTab(t)} style={btnStyle}>{t==="fields"?"Fields":"Code"}</button>)}
   </div>
   {tab==="fields"?<div style={{display:"grid",gap:10}}>
     <label>Scene<select disabled={!ready} value={active?.id||""} onChange={e=>{setSceneId(e.target.value);setTime(document.scenes.find(s=>s.id===e.target.value)?.start||0);}} style={inputStyle}>
       <option value="">Select scene</option>{document.scenes.map(s=><option key={s.id} value={s.id}>{s.id} · {fmt(s.start)} to {fmt(s.end)}</option>)}
     </select></label>
     {active?<div style={{display:"grid",gap:9}}>
       <label>Start (seconds)<input type="number" min={0} max={7200} step=".1" disabled={!ready} value={active.start} style={inputStyle} onChange={e=>updateScene({start:Number(e.target.value)})}/></label>
       <label>End (seconds)<input type="number" min={active.start+.01} max={7200} step=".1" disabled={!ready} value={active.end} style={inputStyle} onChange={e=>updateScene({end:Number(e.target.value)})}/></label>
       <label>Layer<select disabled={!ready} style={inputStyle} value={active.layer} onChange={e=>updateScene({layer:e.target.value})}><option value="overlay">Overlay</option><option value="fullframe">Full frame</option><option value="lowerthird">Lower third</option></select></label>
       <label>Phrase anchor<input disabled={!ready} style={inputStyle} value={active.anchor?.phrase||""} onChange={e=>updateScene({anchor:{...active.anchor,phrase:e.target.value||undefined}})}/></label>
       <label>HTML<textarea rows={5} disabled={!ready} style={inputStyle} value={active.html} onChange={e=>updateScene({html:e.target.value})}/></label>
       <label>CSS<textarea rows={5} disabled={!ready} style={inputStyle} value={active.css} onChange={e=>updateScene({css:e.target.value})}/></label>
       <button type="button" style={btnStyle} disabled={!ready} onClick={()=>{if(window.confirm("Remove this scene?")){update({...document,scenes:document.scenes.filter(s=>s.id!==sceneId)});setSceneId("");}}}>Remove scene</button>
     </div>:<p>No scene selected. Insert a template or switch to Code to write JSON.</p>}
    </div>:<div style={{position:"relative",minHeight:390,background:"#0b141a",border:"1px solid #425360",borderRadius:9,overflow:"hidden"}}>
      <pre ref={codeRef} aria-hidden="true" style={{position:"absolute",inset:0,padding:14,margin:0,overflow:"hidden",whiteSpace:"pre-wrap",overflowWrap:"anywhere",pointerEvents:"none",font:"13px/1.5 ui-monospace,monospace"}} dangerouslySetInnerHTML={{__html:highlight(raw)+"\n"}}/>
      <textarea ref={editorRef} aria-label="Editable video JSON" disabled={!ready} spellCheck={false} value={raw} onChange={e=>{setRaw(e.target.value);setError("");}} onScroll={e=>{if(codeRef.current){codeRef.current.scrollTop=e.currentTarget.scrollTop;codeRef.current.scrollLeft=e.currentTarget.scrollLeft;}}} style={{width:"100%",height:440,position:"relative",display:"block",resize:"vertical",padding:14,margin:0,background:"transparent",color:"transparent",WebkitTextFillColor:"transparent",caretColor:"#fff",border:0,outline:"none",font:"13px/1.5 ui-monospace,monospace",whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}/>
    </div>}
   <div style={{display:"grid",gap:8}}>
    <label>Graphics library<select style={inputStyle} value={graphicId} onChange={e=>setGraphicId(e.target.value)} disabled={!ready||!active||graphics.length===0}>
       <option value="">Select uploaded graphic</option>
       {graphics.map(a=><option key={a.id} value={a.id}>{a.title}</option>)}
    </select></label>
    <button type="button" disabled={!ready||!active||!graphicId} onClick={insertGraphic} style={btnStyle}>Insert registered graphic</button>
    {graphics.length===0?<p style={{fontSize:12,opacity:.7}}>No active image assets in the Graphics library.</p>:null}
    <label>Insert starter template<select style={inputStyle} disabled={!ready} value={template} onChange={e=>setTemplate(e.target.value)}>{VIDEO_SCENE_TEMPLATES.map(t=><option value={t.id} key={t.id}>{t.label}</option>)}</select></label>
    <button type="button" onClick={insert} disabled={!ready} style={btnStyle}>Apply template: Insert scene</button>
    <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
     <button type="button" disabled={!ready||!valid||busy} onClick={()=>void apply()} style={btnStyle}>{busy?"Saving…":"Apply JSON / Fields"}</button>
     <button type="button" disabled={!ready||undo.length===0} onClick={()=>{const prev=undo.at(-1);if(prev){setRaw(prev);setUndo(u=>u.slice(0,-1));}}} style={btnStyle}>Undo</button>
     <button type="button" onClick={()=>{if(!ready||window.confirm("Discard unsaved edits and reload the saved version?")){setRaw(JSON.stringify(value,null,2));setUndo([]);setError("");}}} style={btnStyle}>Reload</button>
    </div>
   </div>
   {!valid?<p role="alert" style={{color:"#f7bd9b"}}>JSON or schema is invalid. The preview shows the last valid document. Open Code to fix it.</p>:null}
   {error?<p role="alert" style={{color:"#f7bd9b"}}>{error}</p>:null}
   {readOnly?<p role="status">Read-only project. You may preview but cannot overwrite a Ready, Scheduled, or rendering project.</p>:null}
  </div>
  <div style={{display:"grid",gap:12,alignContent:"start",minWidth:0}}>
    <h3 style={{margin:0}}>Deterministic frame preview</h3>
    <div style={{background:"#05090c",border:"1px solid #425360",padding:10,borderRadius:10,display:"grid",placeItems:"center",minHeight:240}}>
      <div style={{width:document.format.w*scale,height:document.format.h*scale,position:"relative",overflow:"hidden"}}>
      <iframe title="Video scene at playhead" sandbox="" referrerPolicy="no-referrer" srcDoc={videoFrameHtml(resolveVideoSceneAnchors(document,words),time,guides,words,assetSources)} width={document.format.w} height={document.format.h}
        style={{width:document.format.w,height:document.format.h,position:"absolute",top:0,left:0,transform:`scale(${scale})`,transformOrigin:"top left",border:0,background:"#152631"}}/>
      </div>
    </div>
    <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
      <button type="button" onClick={()=>setPlaying(p=>!p)} style={btnStyle}>{playing?"Pause":"Play"}</button>
      <button type="button" onClick={()=>setLoop(v=>!v)} aria-pressed={loop} style={btnStyle}>Loop {loop?"on":"off"}</button>
      <button type="button" onClick={()=>setGuides(v=>!v)} aria-pressed={guides} style={btnStyle}>Safe areas {guides?"on":"off"}</button>
      <span style={{alignSelf:"center"}}>{fmt(time)} / {fmt(duration)}</span>
    </div>
    <input type="range" aria-label="Scrub video" min={0} max={duration} step={1/document.format.fps} value={time} onChange={e=>setTime(Number(e.target.value))} style={{width:"100%"}}/>
    <div role="group" aria-label="Scene timeline" style={{display:"flex",height:34,background:"#13242b",borderRadius:6,overflow:"hidden",position:"relative"}}>
      {document.scenes.map(s=><button key={s.id} type="button" title={s.id} onClick={()=>{setSceneId(s.id);setTime(s.start);}} style={{position:"absolute",left:(100*s.start/duration)+"%",width:(100*(s.end-s.start)/duration)+"%",height:"100%",border:"1px solid #08141a",color:"#fff",background:s.id===sceneId?"#a12d3d":"#2d5361",overflow:"hidden",fontSize:11,whiteSpace:"nowrap"}}>{s.id}</button>)}
    </div>
    <div aria-label="Word-level transcript lane" style={{border:"1px solid #425360",borderRadius:8,padding:10,minHeight:55,fontSize:13,lineHeight:1.8}}>
      {visibleWords.length?visibleWords.map((w,i)=><button key={i} type="button" onClick={()=>setTime(Number(w.start)||0)} style={{border:0,borderRadius:3,marginRight:3,padding:"2px 4px",color:"#fff",background:time>=Number(w.start||0)&&time<Number(w.end||0)?"#a12d3d":"transparent"}}>{w.word||w.text||""}</button>):<span style={{color:"#91a5af"}}>Word-aligned transcript appears here when available.</span>}
    </div>
    <p style={{fontSize:12,opacity:.7,margin:0}}>Canvas: {document.format.w} × {document.format.h} at {document.format.fps} fps. Video footage and audio are composited by the export worker, not embedded in this graphics-only preview.</p>
  </div>
 </div>;
}
