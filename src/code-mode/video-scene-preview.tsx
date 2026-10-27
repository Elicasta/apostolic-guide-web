"use client";
import {useMemo,useState} from "react";
import {videoSceneDocument,sceneAt,propsAt,type VideoSceneDocument} from "./video-scenes";

function safeMarkup(markup:string){
 // React never inserts markup into the parent app, only into a fully sandboxed iframe.
 return markup.replace(/<\/script/gi,"&lt;/script");
}
export function KineticScenePreview({raw}:{raw:string}){
 const [frame,setFrame]=useState(0),[guides,setGuides]=useState(true);
 const parsed=useMemo(()=>videoSceneDocument.safeParse((()=>{try{return JSON.parse(raw)}catch{return null}})()),[raw]);
 if(!parsed.success)return <p role="alert">Scene preview requires a valid Video V2 document: {parsed.error.issues[0]?.path.join(".")}: {parsed.error.issues[0]?.message}</p>;
 const doc:VideoSceneDocument=parsed.data;
 const duration=Math.max(...doc.scenes.map(s=>s.end));
 const current=frame/doc.format.fps;
 const layers=sceneAt(doc,current);
 const html=layers.map((scene)=>{
  let markup=scene.html;
  const targets=[...new Set(scene.keyframes.map(k=>k.target))];
  for(const target of targets){
   const p=propsAt(scene,target,current);
   const transform="translate("+Number(p.x||0)+"px,"+Number(p.y||0)+"px) rotate("+Number(p.rotate||0)+"deg) scale("+Number(p.scale??1)+")";
   const style="opacity:"+Number(p.opacity??1)+";transform:"+transform+";clip-path:inset(0 "+(100-Number(p.clip??100))+"% 0 0)";
   // Limited data-motion selector; only the validated target string can be interpolated.
   markup=markup.replace(new RegExp('data-motion=["\\x27]'+target+'["\\x27]','g'),match=>match+' style="'+style+'"');
  }
  return '<section class="layer '+scene.layer+'">'+safeMarkup(markup)+'</section><style>'+scene.css+'</style>';
 }).join("");
 const source='<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \\'none\\'; style-src \\'unsafe-inline\\'; img-src data:; font-src data:"><style>*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden}body{container-type:inline-size;background:'+doc.style.ink+';color:'+doc.style.paper+';font-family:Montserrat,Arial,sans-serif}.layer{position:absolute;inset:0;display:grid;place-items:center;overflow:hidden}.lowerthird{inset:65% 5% 8%}.overlay{background:transparent}.fullframe{background:'+doc.style.ink+'}.guide{position:absolute;inset:7% 7% 15%;border:1px dashed #fff8;pointer-events:none}</style></head><body>'+html+(guides?'<div class="guide"></div>':'')+'</body></html>';
 return <section aria-label="Kinetic scene frame preview" style={{display:"grid",gap:12}}>
  <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
   <button type="button" onClick={()=>setFrame(Math.max(0,frame-1))}>Previous frame</button>
   <button type="button" onClick={()=>setFrame(Math.min(Math.ceil(duration*doc.format.fps)-1,frame+1))}>Next frame</button>
   <label><input type="checkbox" checked={guides} onChange={e=>setGuides(e.target.checked)}/>Safe guides</label>
   <output>{current.toFixed(3)}s / {duration.toFixed(3)}s | frame {frame}</output>
  </div>
  <input aria-label="Timeline scrubber" type="range" min={0} max={Math.max(0,Math.ceil(duration*doc.format.fps)-1)} step={1} value={Math.min(frame,Math.ceil(duration*doc.format.fps)-1)} onChange={e=>setFrame(Number(e.target.value))}/>
  <iframe title="Kinetic composition preview" sandbox="" referrerPolicy="no-referrer" srcDoc={source} style={{width:"100%",maxWidth:doc.format.w>doc.format.h?780:380,aspectRatio:doc.format.w+"/"+doc.format.h,border:"1px solid #66777D",background:"#10202A"}}/>
  <small>Frame-stepped scene preview. Footage/audio compositing and production export are not connected yet.</small>
 </section>;
}
