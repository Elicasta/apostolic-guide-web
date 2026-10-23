"use client";
import { useEffect,useState } from "react";
import { ArrowDownToLine, CheckCircle2, Film, Radio, ShieldCheck } from "lucide-react";
import { isTrustedLiveStudioOrigin,isValidHandoffId,validLiveRecording } from "./video-producer-live-handoff";

export function RecentLiveRecording({handoffId,sourceOrigin,onUse}:{handoffId:string;sourceOrigin:string;onUse:(file:File,title:string)=>void}){
 const [recent,setRecent]=useState<{file:File;title:string;duration:number}|null>(null);
 const [state,setState]=useState(handoffId?"waiting":"idle");
 const [error,setError]=useState("");
 const [selected,setSelected]=useState(false);
 useEffect(()=>{
  if(!handoffId || !isValidHandoffId(handoffId) || !isTrustedLiveStudioOrigin(sourceOrigin)){
    if(handoffId)setError("The Live Studio transfer link is invalid. You can still upload a file below.");
    return;
  }
  if(!window.opener){setError("Could not reach the Studio tab. Keep it open and use Send to Video Producer again, or upload the saved file.");return;}
  const studio=window.opener;
  let finished=false;
  const signal=()=>studio.postMessage({type:"AG_EDITOR_IMPORT_READY",transferId:handoffId},sourceOrigin);
  const onMessage=(event:MessageEvent)=>{
    if(event.origin!==sourceOrigin||event.source!==studio)return;
    const data=event.data as {type?:string;transferId?:string;file?:unknown;durationSeconds?:number;title?:string};
    if(data?.type!=="AG_LIVE_RECORDING"||data.transferId!==handoffId)return;
    if(!validLiveRecording(data.file)){
      setError("The received recording was invalid or too large. Use the normal file uploader.");return;
    }
    finished=true;window.clearInterval(timer);
    const media=data.file as File;
    const title=typeof data.title==="string"?data.title.slice(0,180):media.name.replace(/\.[^.]+$/,"");
    setRecent({file:media,title,duration:Number.isFinite(data.durationSeconds)?Math.max(0,Number(data.durationSeconds)):0});
    setState("received");setError("");
    studio.postMessage({type:"AG_EDITOR_IMPORT_RECEIVED",transferId:handoffId},sourceOrigin);
  };
  window.addEventListener("message",onMessage);
  const timer=window.setInterval(()=>{if(!finished)signal()},600);
  signal();
  return()=>{finished=true;window.clearInterval(timer);window.removeEventListener("message",onMessage)};
 },[handoffId,sourceOrigin]);
 return <section aria-label="Recent recordings from Apostolic Guide Live" style={{display:"grid",gap:12}}>
  <div style={{display:"flex",alignItems:"center",gap:9,flexWrap:"wrap"}}><Radio size={17}/><h3 style={{margin:0,fontSize:17}}>Recent Live Recording</h3><span style={{fontSize:11,color:"#728197"}}>FROM BROADCAST STUDIO</span></div>
  {recent ? <div style={{border:"1px solid #bcd8c7",background:"#f1f8f3",borderRadius:12,padding:14,display:"grid",gap:10}}>
    <div style={{display:"flex",alignItems:"center",gap:9,color:"#246647"}}><CheckCircle2 size={17}/><strong>Recording received</strong></div>
    <strong style={{overflowWrap:"anywhere"}}>{recent.file.name}</strong>
    <p style={{margin:0,fontSize:13,color:"#5b6d67"}}>{(recent.file.size/1048576).toFixed(1)} MB · {recent.duration?Math.floor(recent.duration/60)+":"+String(recent.duration%60).padStart(2,"0"):"Duration unknown"} · Original host video and audio</p>
    <button type="button" disabled={selected} onClick={()=>{onUse(recent.file,recent.title);setSelected(true)}}
      style={{display:"inline-flex",justifyContent:"center",alignItems:"center",gap:8,minHeight:46,background:"#152b42",color:"white",border:0,borderRadius:8,cursor:"pointer",padding:"12px 14px",fontWeight:700}}>
      <ArrowDownToLine size={17}/>{selected?"Selected for Video Producer":"Use this recording"}
    </button>
  </div>:<div style={{background:"#f6f8fa",border:"1px solid #dce3e8",borderRadius:12,padding:14,display:"grid",gap:7}}>
    <strong style={{display:"flex",alignItems:"center",gap:7}}><Film size={16}/>{handoffId?"Waiting for the Studio recording…":"Import your latest Studio take"}</strong>
    <p style={{fontSize:13,color:"#637486",margin:0,lineHeight:1.55}}>After recording in Apostolic Guide Live, choose <b>Send to Video Producer</b>. This editor will receive the take and let you import it without saving it to Files first.</p>
    <span style={{fontSize:11,color:"#637486",display:"flex",gap:6,alignItems:"center"}}><ShieldCheck size={14}/> Private browser-to-browser handoff. Studio must remain open until this screen confirms receipt.</span>
  </div>}
  {error?<div role="alert" style={{fontSize:12,color:"#a52b33",lineHeight:1.5}}>{error}</div>:null}
 </section>;
}
