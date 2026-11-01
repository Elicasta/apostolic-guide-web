"use client";
import {useState} from "react";
import {CodeModeJsonPanel} from "./code-mode/json-panel";
import {threadsCodeSchema,emptyThreadsCode,type ThreadsCodeDocument} from "./code-mode/threads";
import {DoctrineCheckPanel} from "./doctrine-check-panel";
type Reviewed={id:string;doctrineStatus:string;issues:unknown[]};
export function ThreadsCodeMode(){
 const [document,setDocument]=useState<ThreadsCodeDocument>(emptyThreadsCode() as ThreadsCodeDocument);
 const [checked,setChecked]=useState<Reviewed[]>([]);
 const [error,setError]=useState("");
 const [busy,setBusy]=useState(false);
 const [passById,setPassById]=useState<Record<string,boolean>>({});
 async function apply(next:ThreadsCodeDocument){
  setBusy(true);setError("");setPassById({});
  try{
   const response=await fetch("/api/admin/threads-studio/code",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(next)});
   const data=await response.json();if(!response.ok)throw new Error(data.error||"Failed to save Threads drafts.");
   const posts=next.posts.map((p,index)=>({...p,id:data.posts[index]?.id||p.id}));
   setDocument({...next,batchId:data.batchId,posts});
   setChecked(data.reviewed||[]);
   setPassById(Object.fromEntries((data.reviewed||[]).map((v:Reviewed)=>[v.id,v.doctrineStatus==="pass"])));
   if(data.reviewed?.some((v:Reviewed)=>v.doctrineStatus==="not_checked"))setError("Drafts saved, but the Doctrine validator was unavailable for some posts. Nothing was approved or published.");
  }catch(e){setError(e instanceof Error?e.message:"Cannot apply Threads document.");}
  finally{setBusy(false);}
 }
 async function ready(){
  setBusy(true);setError("");
  try{
   const response=await fetch("/api/admin/threads-studio/ready",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
    batchId:document.batchId,allowWarnings:false,items:document.posts.map(p=>({id:p.id,body:p.body,category:p.category,mirrorToX:p.mirrorToX,sourceTitle:p.sourceTitle,sourceUrl:p.sourceUrl,sourceSummary:p.sourceSummary}))
   })});
   const data=await response.json();if(!response.ok)throw new Error(data.error||"Doctrine check required.");
   const id=data.posts?.[0]?.id;if(id)window.location.assign("/admin/publishing?view=threads&threadId="+encodeURIComponent(id));
  }catch(e){setError(e instanceof Error?e.message:"Ready blocked.");}
  finally{setBusy(false);}
 }
 const approved=document.posts.length>0&&document.posts.every(p=>Boolean(p.id&&passById[p.id]));
 return <section className="admin-card" style={{padding:18,display:"grid",gap:16}}>
  <header><h2>Threads Code Mode</h2><p>Paste one post or a full weekly batch. Apply only saves drafts and runs the existing Theology check. It never sends a Thread.</p></header>
  <CodeModeJsonPanel label="Threads whole-item JSON" data={document} parse={v=>threadsCodeSchema.parse(v)} onApply={apply} disabled={busy}/>
  {checked.length?<section aria-label="Doctrine results"><h3>Required Doctrine check</h3>{checked.map((review,index)=>
   <div key={review.id} style={{padding:12,marginBottom:12,border:"1px solid #cfd6db"}}>
    <p>Post {index+1}: {review.doctrineStatus}</p>
    <DoctrineCheckPanel key={review.id} sourceType="threads" sourceId={review.id} fields={{body:document.posts[index]?.body||""}} onChange={ok=>setPassById(current=>current[review.id]===ok?current:{...current,[review.id]:ok})}/>
   </div>)}</section>:null}
  {error?<p role="alert">{error}</p>:null}
  <button className="button button-primary" type="button" disabled={busy||!approved} onClick={()=>void ready()}>Send approved drafts to Publishing</button>
  <p>Changing JSON always requires Apply and a fresh Doctrine verdict. FAIL cannot be overridden. FLAG requires an owner approval note.</p>
 </section>;
}
