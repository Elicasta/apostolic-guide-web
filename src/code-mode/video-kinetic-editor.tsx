"use client";
import {useEffect,useMemo,useState} from "react";
import {parseCodeDocument} from "./core";
import {KineticScenePreview} from "./video-scene-preview";
import {videoSceneDocument,videoSceneStarter,type VideoSceneDocument} from "./video-scenes";

const library=[
 {name:"Scripture reveal",layer:"overlay" as const,text:"Hear, O Israel: The LORD our God is one LORD."},
 {name:"Statement punch",layer:"overlay" as const,text:"JESUS IS GOD"},
 {name:"Lower third",layer:"lowerthird" as const,text:"APOSTOLIC GUIDE"},
 {name:"Question stack",layer:"fullframe" as const,text:"WHO IS JESUS?"},
 {name:"Split comparison",layer:"fullframe" as const,text:"CLAIM / SCRIPTURE"},
 {name:"List build",layer:"fullframe" as const,text:"ONE GOD"},
 {name:"Explainer diagram",layer:"fullframe" as const,text:"THE WORD WAS MADE FLESH"},
 {name:"CTA",layer:"overlay" as const,text:"STUDY THE SCRIPTURES"}
];
const initial:VideoSceneDocument={tool:"video",version:2,kind:"studio",id:"draft",
 format:{w:1080,h:1920,fps:30},assets:[],style:{preset:"AG Editorial",ink:"#10202A",paper:"#F5F7F4",crimson:"#A12D3D"},scenes:[videoSceneStarter("scene-1")]};
function template(name:string,id:string,start:number){
 const info=library.find(x=>x.name===name)||library[0];
 const scene=videoSceneStarter(id,info.layer);
 return {...scene,start,end:start+3,html:'<div data-motion="title" class="motion-title">'+info.text.replace(/&/g,"&amp;").replace(/</g,"&lt;")+'</div>'};
}
/** Video V2 editor: all source mutations are guarded by project draft Apply. */
export function VideoKineticCodeEditor({initialId="",initialKind="producer",initialScene=""}:{initialId?:string;initialKind?:"producer"|"studio";initialScene?:string}){
 const [projectId,setProjectId]=useState(initialId),[kind,setKind]=useState<"producer"|"studio">(initialKind),[readOnly,setReadOnly]=useState(false),[busy,setBusy]=useState(false);
 const [raw,setRaw]=useState(JSON.stringify(initial,null,2)),[selected,setSelected]=useState(initialScene||"scene-1");
 const [mode,setMode]=useState<"code"|"fields">("code"),[templateName,setTemplateName]=useState(library[0].name);
 const [history,setHistory]=useState<string[]>([]),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [libraryAssets,setLibraryAssets]=useState<Array<{id:string;title:string}>>([]),[graphicId,setGraphicId]=useState("");
 const [checkpoints,setCheckpoints]=useState<Array<{id:string;createdAt:string}>>([]),[checkpointId,setCheckpointId]=useState("");
 const [sourceUrl,setSourceUrl]=useState(""),[transcriptLane,setTranscriptLane]=useState<Array<{word:string;start:number;end:number}>>([]);
 const [keptRanges,setKeptRanges]=useState<Array<{start:number;end:number}>>([]);
 const parsed=useMemo(()=>{try{return videoSceneDocument.safeParse(JSON.parse(raw))}catch{return null}},[raw]);
 const document=parsed?.success?parsed.data:null;
 const scene=document?.scenes.find(s=>s.id===selected)||document?.scenes[0];
 async function loadProject(checkpoint=""){
  if(!projectId){setError("Enter a project ID or Pathway slug.");return}
  setBusy(true);setError("");setNotice("");
  try{const query=new URLSearchParams({kind,id:projectId});if(checkpoint)query.set("checkpoint",checkpoint);const res=await fetch("/api/admin/code-mode/video-v2?"+query.toString(),{cache:"no-store"});const value=await res.json();if(!res.ok)throw new Error(value.error||"Load failed");setRaw(JSON.stringify(value.document,null,2));setReadOnly(Boolean(value.readOnly));setSelected(initialScene||value.document.scenes?.[0]?.id||"scene-1");setHistory([]);setCheckpoints(Array.isArray(value.history)?value.history:[]);setSourceUrl(String(value.previewSourceUrl||""));setTranscriptLane(Array.isArray(value.transcriptLane)?value.transcriptLane:[]);setKeptRanges(Array.isArray(value.keptRanges)?value.keptRanges:[]);setNotice(checkpoint?"Loaded checkpoint for review. Apply JSON to restore this version.":"Loaded "+value.projectStatus+" project.");}catch(e){setError(e instanceof Error?e.message:"Load failed");}finally{setBusy(false)}
 }
 useEffect(()=>{void fetch("/api/admin/video-producer/graphics",{cache:"no-store"}).then(r=>r.ok?r.json():{assets:[]}).then(value=>{
  const rows=Array.isArray(value.assets)?value.assets:[];
  setLibraryAssets(rows.map((a:{id:string;title:string})=>({id:a.id,title:a.title})));
 }).catch(()=>{/* Empty library is fine. */});},[]);
 useEffect(()=>{if(initialId)void Promise.resolve().then(()=>loadProject());/* Initial link owns first load. */
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);
 async function applyProject(){
  if(readOnly||busy)return;
  setBusy(true);setError("");setNotice("");
  try{const doc=parseCodeDocument(raw,v=>videoSceneDocument.parse(v));
   if(doc.id!==projectId||doc.kind!==kind)throw new Error("Document ID and subtype must match the loaded project.");
   if(!window.confirm("Apply this Video V2 JSON to the project? This checkpoints the prior document and requires re-approval before rendering.")){return}
   const res=await fetch("/api/admin/code-mode/video-v2",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(doc)});
   const value=await res.json();if(!res.ok)throw new Error(value.error||"Apply rejected");setRaw(JSON.stringify(value.document,null,2));setHistory([]);setNotice(value.notice||"Scene draft saved.");
  }catch(e){setError(e instanceof Error?e.message:"Apply failed");}finally{setBusy(false)}
 }
 function update(next:VideoSceneDocument){setHistory(old=>[...old.slice(-39),raw]);setRaw(JSON.stringify(next,null,2));setError("");}
 function insert(){
  if(readOnly||busy)return;
  if(!document){setError("Fix JSON before inserting a template.");return}
  const id="scene-"+(document.scenes.length+1);
  const start=Math.max(...document.scenes.map(s=>s.end));
  update({...document,scenes:[...document.scenes,template(templateName,id,start)]});
  setSelected(id);
 }
 function attachGraphic(){
  if(!document||!scene||!graphicId||readOnly||busy)return;
  const asset=libraryAssets.find(a=>a.id===graphicId);
  if(!asset)return;
  const unique=document.assets.some(a=>a.id===graphicId)?document.assets:[...document.assets,{id:graphicId,kind:"graphic" as const}];
  const image='<img data-asset-id="'+graphicId+'" alt="" class="ag-scene-graphic">';
  const css=scene.css+"\n.ag-scene-graphic{position:absolute;max-width:28%;height:auto;right:5%;bottom:7%;object-fit:contain;}";
  update({...document,assets:unique,scenes:document.scenes.map(s=>s.id===scene.id?{...s,html:s.html+image,css}:s)});
 }
 function patchScene(patch:Partial<NonNullable<typeof scene>>){
  if(readOnly||busy||!document||!scene)return;
  update({...document,scenes:document.scenes.map(s=>s.id===scene.id?{...s,...patch}:s)});
 }
 function validate(){
  try{parseCodeDocument(raw,v=>videoSceneDocument.parse(v));setNotice("Scene JSON is valid. It has not been saved or rendered.");setError("")}
  catch(e){setError(e instanceof Error?e.message:"Invalid document");setNotice("")}
 }
 return <section style={{display:"grid",gap:16}}>
  <h2>Video Code Mode V2</h2>
  <p>Edit saved scenes without changing source media. Apply creates a checkpoint and invalidates approval. Export still requires separate render approval.</p>
  <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"end"}}><label>Project type<select value={kind} disabled={busy} onChange={e=>{setKind(e.target.value as "producer"|"studio");setReadOnly(false)}}><option value="producer">Video Producer</option><option value="studio">Video Studio</option></select></label><label>{kind==="producer"?"Project UUID":"Pathway slug"}<input value={projectId} onChange={e=>setProjectId(e.target.value)} placeholder={kind==="producer"?"Project UUID":"god-is-one"}/></label><button type="button" disabled={busy} onClick={()=>void loadProject()}>{busy?"Loading…":"Load project"}</button></div>
  {checkpoints.length?<div style={{display:"flex",flexWrap:"wrap",gap:8,alignItems:"end"}}><label>Version history<select value={checkpointId} onChange={e=>setCheckpointId(e.target.value)}><option value="">Select checkpoint</option>{checkpoints.map(entry=><option key={entry.id} value={entry.id}>{new Date(entry.createdAt).toLocaleString()}</option>)}</select></label><button type="button" disabled={!checkpointId||busy} onClick={()=>void loadProject(checkpointId)}>Preview checkpoint</button></div>:null}
  {readOnly?<p role="status">This project is Ready, Scheduled, approved, or rendering. You can preview scenes, but cannot Apply edits.</p>:null}
  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
   <button type="button" aria-pressed={mode==="code"} onClick={()=>setMode("code")}>Code</button>
   <button type="button" aria-pressed={mode==="fields"} onClick={()=>setMode("fields")}>Fields</button>
   <button type="button" onClick={validate}>Validate JSON</button><button type="button" disabled={readOnly||busy||!projectId} onClick={()=>void applyProject()}>Apply JSON to draft</button>
   <button type="button" disabled={readOnly||busy||!history.length} onClick={()=>{setRaw(history[history.length-1]);setHistory(history.slice(0,-1))}}>Undo</button>
   <button type="button" onClick={()=>void navigator.clipboard.writeText(raw).catch(()=>setError("Clipboard access denied."))}>Copy JSON</button>
  </div>
  <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"end"}}>
   <label>Scene template<select value={templateName} onChange={e=>setTemplateName(e.target.value)}>{library.map(x=><option key={x.name}>{x.name}</option>)}</select></label>
   <button type="button" disabled={readOnly||busy} onClick={insert}>Insert template</button>
   {libraryAssets.length?<><label>Graphics library<select value={graphicId} onChange={e=>setGraphicId(e.target.value)}><option value="">Select graphic</option>{libraryAssets.map(a=><option key={a.id} value={a.id}>{a.title}</option>)}</select></label><button type="button" disabled={readOnly||busy||!graphicId} onClick={attachGraphic}>Attach graphic</button></>:null}
   {document?<label>Scene<select value={scene?.id||""} onChange={e=>setSelected(e.target.value)}>{document.scenes.map(s=><option key={s.id}>{s.id}</option>)}</select></label>:null}
  </div>
  {mode==="code"?<label>Whole-scene JSON<textarea value={raw} disabled={readOnly||busy} onChange={e=>{setRaw(e.target.value);setError("");setNotice("")}} spellCheck={false} rows={22} style={{width:"100%",font:"13px/1.5 monospace",display:"block",tabSize:2}}/></label>:
   scene?<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12}}>
    <label>Scene start (seconds)<input type="number" disabled={readOnly||busy} min="0" step=".1" value={scene.start} onChange={e=>patchScene({start:Number(e.target.value)})}/></label>
    <label>Scene end (seconds)<input type="number" min="0" step=".1" value={scene.end} onChange={e=>patchScene({end:Number(e.target.value)})}/></label>
    <label>Layer<select disabled={readOnly||busy} value={scene.layer} onChange={e=>patchScene({layer:e.target.value as typeof scene.layer})}><option>overlay</option><option>fullframe</option><option>lowerthird</option></select></label>
    <label style={{gridColumn:"1 / -1"}}>HTML<textarea disabled={readOnly||busy} rows={7} style={{width:"100%",fontFamily:"monospace"}} value={scene.html} onChange={e=>patchScene({html:e.target.value})}/></label>
    <label style={{gridColumn:"1 / -1"}}>CSS<textarea rows={7} style={{width:"100%",fontFamily:"monospace"}} value={scene.css} onChange={e=>patchScene({css:e.target.value})}/></label>
   </div>:<p>JSON is invalid. Return to Code to repair it.</p>}
  {error?<p role="alert">{error}</p>:null}{notice?<p role="status">{notice}</p>:null}
  <KineticScenePreview raw={raw} sourceUrl={sourceUrl} transcriptWords={transcriptLane} keepSegments={keptRanges}/>
 </section>;
}
