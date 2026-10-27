"use client";
import {useMemo,useState} from "react";
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
/** Isolated V2 editor: no persistence or publishing until worker parity is verified. */
export function VideoKineticCodeEditor(){
 const [raw,setRaw]=useState(JSON.stringify(initial,null,2)),[selected,setSelected]=useState("scene-1");
 const [mode,setMode]=useState<"code"|"fields">("code"),[templateName,setTemplateName]=useState(library[0].name);
 const [history,setHistory]=useState<string[]>([]),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const parsed=useMemo(()=>{try{return videoSceneDocument.safeParse(JSON.parse(raw))}catch{return null}},[raw]);
 const document=parsed?.success?parsed.data:null;
 const scene=document?.scenes.find(s=>s.id===selected)||document?.scenes[0];
 function update(next:VideoSceneDocument){setHistory(old=>[...old.slice(-39),raw]);setRaw(JSON.stringify(next,null,2));setError("");}
 function insert(){
  if(!document){setError("Fix JSON before inserting a template.");return}
  const id="scene-"+(document.scenes.length+1);
  const start=Math.max(...document.scenes.map(s=>s.end));
  update({...document,scenes:[...document.scenes,template(templateName,id,start)]});
  setSelected(id);
 }
 function patchScene(patch:Partial<NonNullable<typeof scene>>){
  if(!document||!scene)return;
  update({...document,scenes:document.scenes.map(s=>s.id===scene.id?{...s,...patch}:s)});
 }
 function validate(){
  try{parseCodeDocument(raw,v=>videoSceneDocument.parse(v));setNotice("Scene JSON is valid. It has not been saved or rendered.");setError("")}
  catch(e){setError(e instanceof Error?e.message:"Invalid document");setNotice("")}
 }
 return <section style={{display:"grid",gap:16}}>
  <h2>Video Code Mode V2</h2>
  <p>This is an isolated scene editor preview. It does not alter your projects or exports. Production Apply unlocks only when renderer parity and review gates are complete.</p>
  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
   <button type="button" aria-pressed={mode==="code"} onClick={()=>setMode("code")}>Code</button>
   <button type="button" aria-pressed={mode==="fields"} onClick={()=>setMode("fields")}>Fields</button>
   <button type="button" onClick={validate}>Validate JSON</button>
   <button type="button" disabled={!history.length} onClick={()=>{setRaw(history[history.length-1]);setHistory(history.slice(0,-1))}}>Undo</button>
   <button type="button" onClick={()=>void navigator.clipboard.writeText(raw).catch(()=>setError("Clipboard access denied."))}>Copy JSON</button>
  </div>
  <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"end"}}>
   <label>Scene template<select value={templateName} onChange={e=>setTemplateName(e.target.value)}>{library.map(x=><option key={x.name}>{x.name}</option>)}</select></label>
   <button type="button" onClick={insert}>Insert template</button>
   {document?<label>Scene<select value={scene?.id||""} onChange={e=>setSelected(e.target.value)}>{document.scenes.map(s=><option key={s.id}>{s.id}</option>)}</select></label>:null}
  </div>
  {mode==="code"?<label>Whole-scene JSON<textarea value={raw} onChange={e=>{setRaw(e.target.value);setError("");setNotice("")}} spellCheck={false} rows={22} style={{width:"100%",font:"13px/1.5 monospace",display:"block",tabSize:2}}/></label>:
   scene?<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12}}>
    <label>Scene start (seconds)<input type="number" min="0" step=".1" value={scene.start} onChange={e=>patchScene({start:Number(e.target.value)})}/></label>
    <label>Scene end (seconds)<input type="number" min="0" step=".1" value={scene.end} onChange={e=>patchScene({end:Number(e.target.value)})}/></label>
    <label>Layer<select value={scene.layer} onChange={e=>patchScene({layer:e.target.value as typeof scene.layer})}><option>overlay</option><option>fullframe</option><option>lowerthird</option></select></label>
    <label style={{gridColumn:"1 / -1"}}>HTML<textarea rows={7} style={{width:"100%",fontFamily:"monospace"}} value={scene.html} onChange={e=>patchScene({html:e.target.value})}/></label>
    <label style={{gridColumn:"1 / -1"}}>CSS<textarea rows={7} style={{width:"100%",fontFamily:"monospace"}} value={scene.css} onChange={e=>patchScene({css:e.target.value})}/></label>
   </div>:<p>JSON is invalid. Return to Code to repair it.</p>}
  {error?<p role="alert">{error}</p>:null}{notice?<p role="status">{notice}</p>:null}
  <KineticScenePreview raw={raw}/>
 </section>;
}
