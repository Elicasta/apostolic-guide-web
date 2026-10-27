"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, ShieldCheck, TriangleAlert } from "lucide-react";
export type DoctrineUiState="not_checked"|"pass"|"flag"|"flagged_approved"|"fail";
type Issue={severity:"flag"|"fail";location:string;line:string;reason:string;reference:string};
type Props={sourceType:"creative_project"|"threads"|"custom_asset"|"video_render"|"video_clip";sourceId:string;caption?:string;fields?:Record<string,unknown>;onChange?:(approved:boolean,state:DoctrineUiState)=>void};
const labels:Record<DoctrineUiState,string>={not_checked:"Not checked",pass:"Pass",flag:"Flag",flagged_approved:"Flagged-approved",fail:"Fail"};
export function DoctrineCheckPanel({sourceType,sourceId,caption="",fields={},onChange}:Props) {
 const [state,setState]=useState<DoctrineUiState>("not_checked");
 const [issues,setIssues]=useState<Issue[]>([]);
 const [summary,setSummary]=useState("");
 const [model,setModel]=useState("");
 const [note,setNote]=useState("");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const key=JSON.stringify({sourceType,sourceId,caption,fields});
 useEffect(()=>{
  let live=true;
  setState("not_checked");setIssues([]);setError("");setSummary("");onChange?.(false,"not_checked");
  const params=new URLSearchParams({sourceType,sourceId,caption,fields:JSON.stringify(fields)});
  fetch("/api/admin/doctrine-check?"+params.toString(),{cache:"no-store"}).then(async r=>{
   const data=await r.json();if(!r.ok)throw new Error(data.error||"Cannot read doctrine status.");
   if(!live)return;const next=(data.state||"not_checked") as DoctrineUiState;
   setState(next);setIssues(Array.isArray(data.verdict?.issues)?data.verdict.issues:[]);
   setSummary(String(data.verdict?.summary||""));setModel(String(data.verdict?.model||""));
   onChange?.(["pass","flagged_approved"].includes(next),next);
  }).catch(e=>{if(live)setError(e instanceof Error?e.message:"Status unavailable.");});
  return ()=>{live=false;};
 // key represents exactly the content that will publish. Parent onChange is intentionally not a dependency.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[key]);
 async function action(method:"POST"|"PATCH") {
  setBusy(true);setError("");
  try {
   const res=await fetch("/api/admin/doctrine-check",{method,headers:{"content-type":"application/json"},body:JSON.stringify({sourceType,sourceId,caption,fields,note})});
   const data=await res.json();if(!res.ok)throw new Error(data.error||"Doctrine check unavailable.");
   const next=(data.state||"not_checked") as DoctrineUiState;
   setState(next);setIssues(Array.isArray(data.review?.issues)?data.review.issues:issues);
   setSummary(String(data.review?.summary||summary));setModel(String(data.model||model));
   onChange?.(["pass","flagged_approved"].includes(next),next);
  }catch(e){setError(e instanceof Error?e.message:"Doctrine check failed.");onChange?.(false,state);}
  finally{setBusy(false);}
 }
 return <section className="admin-card doctrine-publish-gate" aria-label="Required doctrine check" style={{padding:20,display:"grid",gap:12}}>
  <header style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
   <div><small>Required before anything publishes</small><h3><ShieldCheck size={17}/> Doctrine check</h3></div>
   <strong data-doctrine-status={state}>{labels[state]}</strong>
  </header>
  <p>{summary||"Check the exact slides, Code Mode text, caption, and all cited Scripture before publishing."}</p>
  {model?<small>Reviewed by {model}. Any content edit requires a new check.</small>:null}
  {issues.length?<ul>{issues.map((issue,index)=><li key={index}><strong>{issue.severity.toUpperCase()} · {issue.location}</strong><div>{issue.line}</div><p>{issue.reason}</p>{issue.reference?<small>Verse: {issue.reference}</small>:null}</li>)}</ul>:null}
  {state==="flag"?<label>Owner approval note (required)<textarea rows={3} minLength={12} value={note} onChange={e=>setNote(e.target.value)} placeholder="Why this flagged wording is acceptable for publication."/></label>:null}
  {error?<p role="alert"><TriangleAlert size={15}/> {error}</p>:null}
  <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
   <button type="button" className="button button-primary" disabled={busy} onClick={()=>void action("POST")}>{busy?"Checking...":"Run Doctrine check"}</button>
   {state==="flag"?<button type="button" className="button" disabled={busy||note.trim().length<12} onClick={()=>void action("PATCH")}>Approve doctrine as owner</button>:null}
   {["pass","flagged_approved"].includes(state)?<span><CheckCircle2 size={15}/> Publishing unlocked for this exact content</span>:null}
  </div>
  {state==="fail"?<p>FAIL cannot be overridden. Fix the lines above and re-check.</p>:null}
 </section>;
}
