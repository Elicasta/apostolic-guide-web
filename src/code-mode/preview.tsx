"use client";
import {useState} from "react";
export function CodeModeSandboxPreview({document,title,width=600,height=680}:{document:string;title:string;width?:number;height?:number}){
 const [mode,setMode]=useState<"desktop"|"mobile"|"dark">("desktop");
 const color=mode==="dark"?"<style>html{color-scheme:dark}body{background:#101820!important;color:#fff!important}</style>":"";
 const source=document.replace(/<\/head>/i,color+"</head>");
 return <section aria-label="Code Mode preview">
  <div style={{display:"flex",gap:8,marginBottom:12}}>{(["desktop","mobile","dark"] as const).map(key=><button type="button" key={key} aria-pressed={mode===key} onClick={()=>setMode(key)}>{key}</button>)}</div>
  <iframe title={title} sandbox="" referrerPolicy="no-referrer" srcDoc={source} style={{display:"block",margin:"0 auto",width:"100%",maxWidth:mode==="mobile"?375:width,height,border:"1px solid #cdd4d8",background:mode==="dark"?"#101820":"#fff"}}/>
 </section>;
}
