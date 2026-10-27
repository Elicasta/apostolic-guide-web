"use client";
import {useEffect,useState} from "react";
import {CodeModeJsonPanel} from "./json-panel";
import {VideoKineticCodeEditor} from "./video-kinetic-editor";
import {initialWholeItem,wholeItemSchema,type WholeItemCode} from "./whole-item";
type Tool=WholeItemCode["tool"];
const OPTIONS:Tool[]=["website","content_engine","episode","audio","teleprompter","video"];
function initial(tool:Tool){return initialWholeItem(tool) as WholeItemCode;}
export function WholeItemCodeMode({initialTool="website",initialId="",initialVideoKind="producer",initialScene=""}:{initialTool?:string;initialId?:string;initialVideoKind?:"producer"|"studio";initialScene?:string}){
 const [tool,setTool]=useState<Tool>(OPTIONS.includes(initialTool as Tool)?initialTool as Tool:"website");
 const [id,setId]=useState(initialId);
 const [kind,setKind]=useState("script");
 const [document,setDocument]=useState<WholeItemCode>(initial(OPTIONS.includes(initialTool as Tool)?initialTool as Tool:"website"));
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
 function select(next:Tool){setTool(next);setId("");setDocument(initial(next));setMessage("");setError("");}
 async function load(nextTool=tool,nextId=id,nextKind=kind){
  setBusy(true);setError("");
  try{
   const params=new URLSearchParams({tool:nextTool,kind:nextKind});if(nextId)params.set("id",nextId);
   const response=await fetch("/api/admin/code-mode?"+params.toString(),{cache:"no-store"});
   const data=await response.json();if(!response.ok)throw new Error(data.error||"Could not open draft.");
   setDocument(data.document as WholeItemCode);
   setMessage(nextId?"Loaded an existing draft.":"Empty Code Mode document. Fill required fields before Apply.");
  }catch(e){setError(e instanceof Error?e.message:"Load failed.");}finally{setBusy(false);}
 }
 useEffect(()=>{if(initialId)void Promise.resolve().then(()=>load(tool,initialId,kind));
 // Initial page route uniquely scopes the first load.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);
 async function apply(next:WholeItemCode){
  setBusy(true);setError("");setMessage("");
  try{
   const parsed=wholeItemSchema.parse(next);
   const response=await fetch("/api/admin/code-mode",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(parsed)});
   const data=await response.json();if(!response.ok)throw new Error(data.error||"Draft Apply failed.");
   const id=String(data.sourceId||"");
   setId(id);
   setMessage(String(data.notice||"Draft saved. This did not publish."));
   await load(parsed.tool,id,parsed.tool==="episode"?parsed.kind:parsed.tool==="video"?parsed.kind:kind);
  }catch(e){setError(e instanceof Error?e.message:"Apply failed.");}finally{setBusy(false);}
 }
 if(tool==="video")return <section className="admin-card" style={{padding:20,display:"grid",gap:14}}>
  <label>Code Mode tool <select value={tool} onChange={e=>select(e.target.value as Tool)}>{OPTIONS.map(v=><option key={v} value={v}>{v.replace("_"," ")}</option>)}</select></label>
  <VideoKineticCodeEditor initialId={initialId} initialKind={initialVideoKind} initialScene={initialScene}/>
 </section>;
 return <section className="admin-card" style={{padding:20,display:"grid",gap:14}}>
  <h2>Whole-item Code Mode</h2>
  <p>One versioned JSON format per tool. Apply saves draft content only. It cannot approve doctrine, schedule, publish, render, or send.</p>
  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12}}>
   <label>Tool<select value={tool} onChange={e=>select(e.target.value as Tool)}>{OPTIONS.map(v=><option key={v} value={v}>{v.replace("_"," ")}</option>)}</select></label>
   <label>Existing draft ID, date or slug<input value={id} onChange={e=>setId(e.target.value)} placeholder="UUID, 2026-11-01 or pathway-slug"/></label>
   {["episode","video"].includes(tool)?<label>Subtype<select value={kind} onChange={e=>setKind(e.target.value)}>{tool==="episode"?<><option value="script">Script</option><option value="article">Article</option></>:<><option value="studio">Video Studio</option><option value="producer">Video Producer</option></>}</select></label>:null}
  </div>
  <button type="button" disabled={busy} onClick={()=>void load()}>{busy?"Loading…":"Load existing draft / New document"}</button>
  <CodeModeJsonPanel key={tool+":"+id+":"+kind} label={tool+" whole-item JSON"} data={document} parse={raw=>wholeItemSchema.parse(raw)} onApply={apply} disabled={busy}/>
  {tool==="teleprompter"?<p>Saved scripts stay in a private drafting library. They do not update a live Teleprompter session or remote display.</p>:null}
  {error?<p role="alert">{error}</p>:null}
  {message?<p role="status">{message}</p>:null}
 </section>;
}
