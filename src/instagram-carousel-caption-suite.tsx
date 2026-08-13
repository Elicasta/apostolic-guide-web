"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Sparkles } from "lucide-react";

type Draft = { pathwaySlug?: string | null; title?: string; total?: number };
type SlideCopy = { index:number; title:string; caption:string; altText:string };
type Suite = { keyword:string; masterCaption:string; slides:SlideCopy[] };

export function InstagramCarouselCaptionSuite(){
  const[target,setTarget]=useState<Element|null>(null);const[draft,setDraft]=useState<Draft|null>(null);const[suite,setSuite]=useState<Suite|null>(null);const[busy,setBusy]=useState(false);const[error,setError]=useState("");
  useEffect(()=>{const sync=()=>setTarget(document.querySelector(".instagram-static-publishing-flow"));sync();const t=window.setInterval(sync,500);return()=>window.clearInterval(t)},[]);
  useEffect(()=>{try{const raw=localStorage.getItem("ag-carousel-publishing-handoff-v1");setDraft(raw?JSON.parse(raw):null)}catch{setDraft(null)}},[]);
  const slug=draft?.pathwaySlug?.trim()||"";const count=Math.min(10,Math.max(1,Number(draft?.total)||8));
  useEffect(()=>{if(!slug)return;try{const raw=localStorage.getItem(`ag-carousel-captions:${slug}`);setSuite(raw?JSON.parse(raw):null)}catch{setSuite(null)}},[slug]);
  function save(next:Suite){setSuite(next);if(slug)try{localStorage.setItem(`ag-carousel-captions:${slug}`,JSON.stringify(next))}catch{}}
  async function generate(){if(!slug||busy)return;setBusy(true);setError("");try{const response=await fetch("/api/admin/publishing/carousel-captions",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({slug,title:draft?.title||"Carousel",slides:count})});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||"Caption generation failed.");save({keyword:data.keyword,masterCaption:data.masterCaption,slides:data.slides})}catch(err){setError(err instanceof Error?err.message:"Caption generation failed.")}finally{setBusy(false)}}
  if(!target||!slug)return null;
  return createPortal(<section className="instagram-caption-suite"><div className="instagram-caption-suite-head"><div><span className="section-kicker">Publishing copy</span><h3>Slide-by-slide caption set</h3><p>One master post caption plus matching copy and alt text for each slide.</p></div><button className="button" type="button" onClick={()=>void generate()} disabled={busy}>{busy?<Loader2 className="spin" size={14}/>:<Sparkles size={14}/>} {suite?"Regenerate":"Generate captions"}</button></div>{error?<p className="instagram-caption-error">{error}</p>:null}{suite?<><div className="instagram-keyword-row"><span>Pathway keyword</span><strong>{suite.keyword}</strong><small>Keep this exact keyword in the CTA.</small></div><label className="instagram-master-caption"><span>Master Instagram caption</span><textarea rows={8} value={suite.masterCaption} onChange={e=>save({...suite,masterCaption:e.target.value})}/></label><div className="instagram-platform-note"><strong>Instagram carousels publish one public post caption.</strong><span>The fields below are slide-specific copy for repurposing and per-image accessibility text.</span></div><div className="instagram-slide-caption-grid">{suite.slides.map(slide=><article className="instagram-slide-caption-card" key={slide.index}><header><span>Slide {String(slide.index).padStart(2,"0")}</span><strong>{slide.title}</strong></header><label><span>Slide copy</span><textarea rows={5} value={slide.caption} onChange={e=>save({...suite,slides:suite.slides.map(s=>s.index===slide.index?{...s,caption:e.target.value}:s)})}/></label><label><span>Alt text</span><textarea rows={3} value={slide.altText} onChange={e=>save({...suite,slides:suite.slides.map(s=>s.index===slide.index?{...s,altText:e.target.value}:s)})}/></label><footer>Keyword: <b>{suite.keyword}</b></footer></article>)}</div></>:<div className="instagram-caption-empty"><Sparkles size={22}/><div><strong>Generate caption package</strong><span>AI follows the Pathway and keeps the pathway keyword consistent.</span></div></div>}</section>,target)
}
