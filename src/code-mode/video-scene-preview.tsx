"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import {videoSceneDocument} from "./video-scenes";
import {renderVideoSceneFrame,type SceneFontMap} from "./video-scene-frame";
const FILES:Record<keyof SceneFontMap,string>={
 montserrat400:"/fonts/montserrat-400.woff",montserrat800:"/fonts/montserrat-800.woff",
 bebas400:"/fonts/bebas-400.woff",cormorant400:"/fonts/cormorant-400.woff",
 cormorant700:"/fonts/cormorant-700.woff",
 playfairVariable:"/fonts/playfair-display-variable.ttf"
};
export function KineticScenePreview({raw,sourceUrl="",sourceOffset=0,transcriptWords=[],keepSegments=[]}:{raw:string;sourceUrl?:string;sourceOffset?:number;transcriptWords?:Array<{word:string;start:number;end:number}>;keepSegments?:Array<{start:number;end:number}>}){
 const [frame,setFrame]=useState(0),[guides,setGuides]=useState(true),[playing,setPlaying]=useState(false),[loop,setLoop]=useState(true);
 const [fonts,setFonts]=useState<SceneFontMap>({});
 const [images,setImages]=useState<Record<string,string>>({});
 const previewRef=useRef<HTMLDivElement>(null),footageRef=useRef<HTMLVideoElement>(null),[previewWidth,setPreviewWidth]=useState(380);
 const parsed=useMemo(()=>videoSceneDocument.safeParse((()=>{try{return JSON.parse(raw)}catch{return null}})()),[raw]);
 const doc=parsed.success?parsed.data:null;
 const fps=doc?.format.fps||30;
 const duration=doc?Math.max(...doc.scenes.map(s=>s.end)):0;
 const assetIds=JSON.stringify(doc?.assets.map(a=>a.id)??[]);
 useEffect(()=>{let alive=true;const ids=JSON.parse(assetIds) as string[];
  Promise.all(ids.map(async id=>{
   const res=await fetch("/api/admin/code-mode/video-v2/assets/"+encodeURIComponent(id),{cache:"no-store"});
   if(!res.ok)throw new Error("Graphic unavailable");
   const type=(res.headers.get("content-type")||"").split(";")[0];
   const bytes=new Uint8Array(await res.arrayBuffer());
   let base="";for(const b of bytes)base+=String.fromCharCode(b);
   return [id,"data:"+type+";base64,"+btoa(base)] as const;
  })).then(items=>{if(alive)setImages(Object.fromEntries(items))}).catch(()=>{if(alive)setImages({})});
  return ()=>{alive=false};
 },[assetIds]);
 useEffect(()=>{const element=previewRef.current;if(!element)return;
  const observer=new ResizeObserver(()=>setPreviewWidth(element.clientWidth));observer.observe(element);
  return ()=>observer.disconnect();
 },[doc?.format.w,doc?.format.h]);
 const endFrame=Math.max(0,Math.ceil(duration*fps)-1);
 useEffect(()=>{
  let active=true;
  Promise.all(Object.entries(FILES).map(async([key,url])=>{
   const res=await fetch(url);if(!res.ok)throw new Error("Font not available");
   const bytes=new Uint8Array(await res.arrayBuffer());
   let s="";for(const b of bytes)s+=String.fromCharCode(b);
   return [key,btoa(s)] as const;
  })).then(entries=>{if(active)setFonts(Object.fromEntries(entries));}).catch(()=>{/* fallback fonts until bundled assets load */});
  return ()=>{active=false};
 },[]);
 useEffect(()=>{
  if(!playing||!doc)return;
  const timer=setInterval(()=>setFrame(f=>f>=endFrame?(loop?0:endFrame):f+1),1000/fps);
  return ()=>clearInterval(timer);
 },[playing,loop,doc,endFrame,fps]);
 const current=Math.min(frame,endFrame)/fps;
 let outputCursor=0,sourceClock=current;
 if(keepSegments.length){for(const segment of keepSegments){
  const length=segment.end-segment.start;
  if(current>=outputCursor&&current<outputCursor+length){sourceClock=segment.start+current-outputCursor;break}
  outputCursor+=length;
 }}
 const requestedVideoTime=sourceOffset+sourceClock;
 useEffect(()=>{
  const video=footageRef.current;if(!video||!sourceUrl)return;
  if(Math.abs(video.currentTime-requestedVideoTime)>.15)video.currentTime=requestedVideoTime;
  if(playing){void video.play().catch(()=>{});}else video.pause();
 },[requestedVideoTime,sourceUrl,playing]);
 let source:string;
 try{source=doc?renderVideoSceneFrame(doc,current,fonts,images):""}catch{source=""}
 if(!doc)return <p role="alert">Fix Video V2 JSON to preview: {parsed.success?"Unknown validation error":parsed.error.issues[0]?.path.join(".")+": "+parsed.error.issues[0]?.message}</p>;
 return <section aria-label="Kinetic scene frame preview" style={{display:"grid",gap:12}}>
  <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
   <button type="button" onClick={()=>setPlaying(v=>!v)}>{playing?"Pause":"Play"}</button>
   <button type="button" onClick={()=>setFrame(f=>Math.max(0,f-1))}>Previous frame</button>
   <button type="button" onClick={()=>setFrame(f=>Math.min(endFrame,f+1))}>Next frame</button>
   <label><input type="checkbox" checked={loop} onChange={e=>setLoop(e.target.checked)}/>Loop</label>
   <label><input type="checkbox" checked={guides} onChange={e=>setGuides(e.target.checked)}/>Safe guides</label>
   <output>{current.toFixed(3)}s / {duration.toFixed(3)}s | frame {frame}</output>
  </div>
  <input aria-label="Timeline scrubber" type="range" min={0} max={endFrame} step={1} value={Math.min(frame,endFrame)} onChange={e=>setFrame(Number(e.target.value))}/>
  <div ref={previewRef} style={{position:"relative",width:"100%",maxWidth:doc.format.w>doc.format.h?780:380,aspectRatio:doc.format.w+"/"+doc.format.h,background:"#10202A",overflow:"hidden"}}>
   {sourceUrl?<video ref={footageRef} src={sourceUrl} playsInline muted preload="metadata" aria-label="Source footage preview" style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover"}}/>:null}
   <iframe title="Kinetic composition preview" sandbox="" referrerPolicy="no-referrer" srcDoc={source} style={{display:"block",position:"relative",width:doc.format.w,height:doc.format.h,transformOrigin:"top left",transform:"scale("+(previewWidth/doc.format.w)+")",border:0,pointerEvents:"none"}}/>
   {guides?<div aria-hidden="true" style={{position:"absolute",inset:"7% 7% 15%",border:"1px dashed #ffffff80",pointerEvents:"none"}}/>:null}
  </div>
  {transcriptWords.length?<div aria-label="Word-level transcript lane" style={{display:"flex",gap:5,overflowX:"auto",padding:8,border:"1px solid #66777D",maxWidth:780}}>{transcriptWords.filter(w=>w.end>=current-2&&w.start<=current+5).slice(0,50).map((w,i)=><button type="button" key={w.start+":"+i} aria-label={"Go to word "+w.word+" at "+w.start.toFixed(2)+" seconds"} onClick={()=>setFrame(Math.round(w.start*fps))} style={{whiteSpace:"nowrap",border:w.start<=current&&w.end>=current?"2px solid #A12D3D":"1px solid #66777D"}}>{w.word}</button>)}</div>:null}
  <small>Scene typography and motion use the exact export frame generator. Footage is positioned from the retained edit ranges; playback decoding may vary by browser.</small>
 </section>;
}
