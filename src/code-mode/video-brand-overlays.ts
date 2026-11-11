import type {VideoSceneDocument} from "./video-scenes";
import {expandCodePlaceholders,escapeCodeText} from "./core";

/** One document-level template plus typed timed items. No publishing actions or scripts. */
export const VIDEO_BRAND_TEMPLATE_HTML = '<div class="vp-template"><span class="vp-kicker">{{kicker}}</span><strong>{{boxText}}</strong><span class="vp-label">{{label}}</span></div>';
const escape=escapeCodeText;
const safeColor=(raw:string,fallback:string)=>/^#[0-9a-fA-F]{6}$/.test(raw)?raw:fallback;
const safeFont=(raw:unknown)=>typeof raw==="string"&&/^[A-Za-z0-9 ,'-]{1,90}$/.test(raw)?raw:"Montserrat";
const embedded=(raw:string|undefined)=>raw&&/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(raw)?raw:null;

export function compileVideoBrandOverlayFrame(doc:VideoSceneDocument,time:number,imageData:Record<string,string>={}):{html:string;css:string}{
 const fields={series:"",episodeTitle:"",logo:"",lowerThird:"",boxText:"",quote:"",kicker:"",label:"",...doc.fields};
 const logoData=embedded(imageData["__brand_logo"]);
 const css=`<style>
 :root{--vp-ink:${safeColor(doc.style.ink,"#0E1E2D")};--vp-accent:${safeColor(doc.style.crimson,"#B3212D")};--vp-paper:${safeColor(doc.style.paper,"#FFF9F2")}}
 .vp-overlay{position:absolute;inset:0;z-index:10;pointer-events:none;font-family:"${safeFont((doc.style as Record<string,unknown>).fontFamily)}",Montserrat,Arial,sans-serif;color:var(--vp-paper)}
 .vp-overlay.vp-top-left{display:flex;align-items:flex-start;justify-content:flex-start;padding:5%}
 .vp-overlay.vp-top-right{display:flex;align-items:flex-start;justify-content:flex-end;padding:5%}
 .vp-overlay.vp-lower-left{display:flex;align-items:flex-end;justify-content:flex-start;padding:0 5% 13%}
 .vp-overlay.vp-bottom{display:flex;align-items:flex-end;justify-content:center;padding:0 5% 13%}
 .vp-overlay.vp-center{display:grid;place-items:center;padding:5%}
 .vp-overlay.vp-full{display:grid;place-items:center}
 .vp-logo{position:absolute;right:5%;top:5%;max-width:19%;max-height:10%;object-fit:contain;font-weight:700;font-size:2.4cqw;letter-spacing:.06em;text-align:right}
 .vp-full-card{position:absolute;inset:0;background:var(--vp-ink);display:grid;place-items:center}
 .vp-card-copy{height:100%;width:86%;display:flex;flex-direction:column;align-items:center;justify-content:space-evenly;text-align:center;gap:3cqh}
 .vp-outro .vp-card-copy{height:75%;align-self:start}
 .vp-card-series{font-size:clamp(22px,4.2cqw,76px);font-family:inherit;line-height:1.1;letter-spacing:.07em;overflow-wrap:anywhere}
 .vp-card-title{font-size:clamp(32px,7cqw,120px);font-family:"Playfair Display",Georgia,serif;line-height:1.12;overflow-wrap:anywhere}
 .vp-lower-third{background:var(--vp-ink);border-left:.15em solid var(--vp-accent);font-size:clamp(22px,3.4cqw,62px);line-height:1.24;padding:.32em .55em;max-width:90%;overflow-wrap:anywhere}
 .vp-box{background:var(--vp-accent);color:#fff;display:inline-flex;justify-content:center;align-items:center;text-align:center;font-size:clamp(30px,6cqw,116px);line-height:1.12;padding:.22em .35em;max-width:90%;overflow-wrap:anywhere}
 .vp-box>span{position:relative;top:.015em}
 .vp-quote{font-family:"Playfair Display",Georgia,serif;font-size:clamp(28px,4.8cqw,90px);line-height:1.18;max-width:86%;text-align:center}
 .vp-short-end{font-size:clamp(28px,6cqw,100px);font-weight:700;text-align:center;max-width:82%;line-height:1.15;background:var(--vp-ink);padding:.45em}
 .vp-template{display:flex;flex-direction:column;align-items:center;text-align:center;gap:1.2em;max-width:90%;padding:1em}
 .vp-kicker{font-size:2.5cqw;letter-spacing:.14em;text-transform:uppercase}.vp-label{font-size:2.3cqw}
 </style>`;
 const active=(doc.overlays||[]).filter(item=>item.start<=time&&time<item.end);
 const html=active.map(item=>{
  const values={series:fields.series,episodeTitle:fields.episodeTitle,logo:fields.logo,
   lowerThird:fields.lowerThird,boxText:fields.boxText,quote:fields.quote,kicker:fields.kicker,label:fields.label};
  let body="";
  const text=escape(item.text||"");
  if(doc.templateHtml){
   body=expandCodePlaceholders(doc.templateHtml,{...values,boxText:item.text||values.boxText,lowerThird:item.text||values.lowerThird,quote:item.text||values.quote});
  }else if(item.type==="logo"){
   body=logoData?'<img alt="" class="vp-logo" src="'+logoData+'">':'<span class="vp-logo">'+escape(fields.logo)+'</span>';
  }else if(item.type==="intro"||item.type==="outro"){
   body='<div class="vp-full-card '+(item.type==="outro"?"vp-outro":"vp-intro")+'"><div class="vp-card-copy"><span class="vp-card-series">'+escape(fields.series)+'</span><strong class="vp-card-title">'+escape(item.text||fields.episodeTitle)+'</strong></div></div>';
  }else if(item.type==="lowerThird")body='<div class="vp-lower-third">'+text+'</div>';
  else if(item.type==="boxText")body='<div class="vp-box"><span>'+text+'</span></div>';
  else if(item.type==="quote")body='<blockquote class="vp-quote">'+text+'</blockquote>';
  else if(item.type==="shortsEnd")body='<div class="vp-short-end">Full episode on my channel.</div>';
  else if(item.type==="captions")body='<div class="vp-lower-third">'+text+'</div>';
  const klass="vp-"+item.position;
  return '<div data-timed-overlay="'+escape(item.type)+'" class="vp-overlay '+klass+'" data-preset="'+escape(item.preset)+'">'+body+'</div>';
 }).join("");
 return {html,css:doc.themeCss?css+'<style>'+doc.themeCss+'</style>':css};
}
