'use client';
import {useState} from 'react';
import type {CreativeFrame} from './creative-project';
import type {StudioDesign} from './carousel-composition';
async function request<T>(url:string,body:unknown,method='POST'):Promise<T>{const r=await fetch(url,{method,headers:{'content-type':'application/json'},body:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw new Error(data.error||'Artwork request failed.');return data;}
export function CarouselBackgroundPanel({projectId,pathwaySlug,format,theme,frame,totalSlides,hasBackground,enabled,onBackground,onDesign}:{projectId:string;pathwaySlug:string;format:string;theme:string;frame:CreativeFrame;totalSlides:number;hasBackground:boolean;enabled:boolean;onBackground:(url:string)=>void;onDesign:(design:StudioDesign)=>void}){
 const [prompt,setPrompt]=useState('');const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
 const visualStyle=({'street-theology':'street','editorial-white':'editorial','verse-connection':'verse'} as Record<string,string>)[theme]||theme;
 async function run(action:'generate'|'recommend'|'texture'|'remove'){
  if(busy)return;setBusy(true);setMessage('');
  try{
   if(action==='remove'){await request(`/api/admin/creative-projects/${projectId}/artwork`,{frameId:frame.id},'DELETE');onBackground('');}
   if(action==='recommend'){
    const {direction}=await request<{direction:{prompt:string;reason:string}}>('/api/admin/carousel-studio/background-direct',{style:visualStyle,kind:({hook:"cover",support:"connection",explanation:"statement"} as Record<string,string>)[frame.role]||frame.role,title:frame.headline,body:frame.body.slice(0,800),reference:frame.scripture,secondaryReference:'',slideNumber:frame.order,totalSlides});setPrompt(direction.prompt);setMessage(direction.reason);
   }
   if(action==='texture'){
    const {direction:choice}=await request<{direction:{texture:string;strength:number;rationale:string}}>('/api/admin/carousel-studio/texture-direct',{style:visualStyle,title:frame.headline,body:frame.body.slice(0,800),instruction:prompt});onDesign({texture:choice.texture,textureStrength:choice.strength});setMessage(choice.rationale);
   }
   if(action==='generate'){
    const generated=await request<{dataUrl:string;prompt:string;imageModel:string}>('/api/admin/pathway-assets/generate-image',{pathwaySlug,creationType:format==='story'?'story':'background',visualStyle,prompt,orientation:'portrait',quality:'medium'});
    const uploaded=await request<{asset:{id:string}}>('/api/admin/pathway-assets/upload',{pathwaySlug,studio:'carousel',assetType:'generated-image',title:`Slide ${frame.order} artwork`,dataUrl:generated.dataUrl,sourceType:'generated',prompt:generated.prompt,model:generated.imageModel,metadata:{creativeProjectId:projectId,frameId:frame.id}});
    const linked=await request<{background:{previewUrl:string}}>(`/api/admin/creative-projects/${projectId}/artwork`,{frameId:frame.id,assetId:uploaded.asset.id,artDirection:prompt});onBackground(linked.background.previewUrl);setMessage('Artwork saved to this slide.');
   }
  }catch(e){setMessage(e instanceof Error?e.message:'Artwork request failed.');}finally{setBusy(false);}
 }
 return <details><summary>Image & texture direction</summary><fieldset disabled={busy} style={{border:0,padding:0,margin:0}}><label>Art direction<textarea aria-label="Art direction" value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder="Describe the visual layer. Typography stays editable."/></label><div style={{display:'flex',gap:6,flexWrap:'wrap'}}><button type="button" disabled={!enabled} onClick={()=>void run('recommend')}>Suggest imagery</button><button type="button" disabled={!enabled} onClick={()=>void run('texture')}>Choose texture with Sol</button><button type="button" disabled={!enabled||prompt.trim().length<3} onClick={()=>void run('generate')}>Generate art with Sol</button>{hasBackground&&<button type="button" onClick={()=>void run('remove')}>Remove image</button>}</div></fieldset>{busy&&<p role="status">Preparing visual layer…</p>}{message&&<p role="status">{message}</p>}</details>;
}
