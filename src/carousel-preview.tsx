'use client';
import { useEffect, useRef, useState } from 'react';
import type { ArtworkInput } from './carousel-artwork';
import { FONT_FILES, renderCarouselSvg, type ArtworkAssets } from './carousel-render';
let browserAssets: Promise<ArtworkAssets> | undefined;
async function dataUrl(url:string) {
  const response = await fetch(url);
  if(!response.ok) throw new Error('Brand assets could not be loaded.');
  const blob=await response.blob();
  return new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(blob);});
}
export function loadBrowserArtworkAssets() {
  if(!browserAssets) browserAssets=Promise.all([
    dataUrl('/brand/apostolic-guide-mark-reversed.png'),dataUrl('/brand/apostolic-guide-mark.png'),
    Promise.all(FONT_FILES.map(async f=>{const r=await fetch('/fonts/'+f.file);if(!r.ok)throw new Error('Typography could not be loaded.');return {name:f.name,weight:f.weight,style:'normal' as const,data:await r.arrayBuffer()};}))
  ]).then(([darkLogo,lightLogo,fonts])=>({darkLogo,lightLogo,fonts})).catch(e=>{browserAssets=undefined;throw e;});
  return browserAssets;
}
export async function artworkPng(input:Omit<ArtworkInput,'brandAssets'>) {
  const {svg,issues}=await renderCarouselSvg(input,await loadBrowserArtworkAssets());
  if(issues.length)throw new Error(issues.join(' '));
  const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));
  try {
    const image=new Image();image.src=url;await image.decode();
    const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=input.height||1350;
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('PNG export is unavailable.');
    ctx.drawImage(image,0,0);return canvas.toDataURL('image/png');
  } finally {URL.revokeObjectURL(url);}
}
export function CarouselPreview({input,onIssues}:{input:Omit<ArtworkInput,'brandAssets'>;onIssues?:(issues:string[])=>void}) {
  const [result,setResult]=useState<{url:string;issues:string[]}|null>(null);
  const [error,setError]=useState('');
  const callback=useRef(onIssues);
  useEffect(()=>{callback.current=onIssues;},[onIssues]);
  const signature=JSON.stringify(input);
  useEffect(()=>{
    let cancelled=false;let url='';
    void loadBrowserArtworkAssets().then(assets=>renderCarouselSvg(JSON.parse(signature),assets)).then(({svg,issues})=>{
      if(cancelled)return;url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));setResult({url,issues});setError('');callback.current?.(issues);
    }).catch(e=>{if(!cancelled){setError(e.message);callback.current?.([e.message]);}});
    return ()=>{cancelled=true;if(url)URL.revokeObjectURL(url);};
  },[signature]);
  return <div style={{width:'100%',aspectRatio:`1080 / ${input.height||1350}`,position:'relative',background:'#e5e2db'}}>
    {result && <img src={result.url} alt={input.frame.altText||input.frame.headline} style={{display:'block',width:'100%',height:'100%'}}/>}
    {!result&&!error&&<span role="status">Preparing artwork…</span>}
    {error&&<p role="alert">{error}</p>}
  </div>;
}
