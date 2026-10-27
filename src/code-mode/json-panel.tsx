"use client";
import {useState} from "react";
import {parseCodeDocument} from "./core";
export function CodeModeJsonPanel<T>({label,data,parse,onApply,disabled=false}:{label:string;data:T;parse:(v:unknown)=>T;onApply:(v:T)=>void|Promise<void>;disabled?:boolean}){
 const [raw,setRaw]=useState(()=>JSON.stringify(data,null,2)),[dirty,setDirty]=useState(false),[error,setError]=useState(""),[saving,setSaving]=useState(false);
 async function apply(){setError("");setSaving(true);try{await onApply(parseCodeDocument(raw,parse));setDirty(false);}catch(e){setError(e instanceof Error?e.message:"Invalid JSON");}finally{setSaving(false);}}
 return <div style={{display:"grid",gap:10}}><label>{label}<textarea spellCheck={false} aria-label={label} value={raw} onChange={e=>{setDirty(true);setRaw(e.target.value)}} rows={18} disabled={disabled||saving} style={{display:"block",width:"100%",font:"14px monospace"}}/></label>
  <div style={{display:"flex",gap:8}}><button type="button" disabled={disabled||saving} onClick={()=>void apply()}>Apply JSON</button><button type="button" onClick={()=>void navigator.clipboard.writeText(raw).catch(()=>setError("Clipboard denied"))}>Copy JSON</button><button type="button" disabled={saving} onClick={()=>{setRaw(JSON.stringify(data,null,2));setDirty(false);setError("")}}>Reload</button></div>
  {dirty?<small>Unsaved changes. Apply JSON to save the draft.</small>:null}{error?<p role="alert">{error}</p>:null}
 </div>;
}
