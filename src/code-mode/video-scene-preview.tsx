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
export function KineticScenePreview({raw}:{raw:string}){
 const [frame,setFrame]=useState(0),[guides,setGuides]=useState(true),[playing,setPlaying]=useState(false),[loop,setLoop]=useState(true);
 const [fonts,setFonts]=useState<SceneFontMap>({});
 const [images,setImages]=useState<Record<string,string>>({});
 const previewRef=useRef<HTMLDivElement>(null),[previewWidth,setPreviewWidth]=useState(380);
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
   <iframe title="Kinetic composition preview" sandbox="" referrerPolicy="no-referrer" srcDoc={source} style={{display:"block",width:doc.format.w,height:doc.format.h,transformOrigin:"top left",transform:"scale("+(previewWidth/doc.format.w)+")",border:0}}/>
   {guides?<div aria-hidden="true" style={{position:"absolute",inset:"7% 7% 15%",border:"1px dashed #ffffff80",pointerEvents:"none"}}/>:null}
  </div>
  <small>Frame-stepped preview shares the HTML generator with the Chromium export worker. Source video and audio are not shown here.</small>
 </section>;
}
