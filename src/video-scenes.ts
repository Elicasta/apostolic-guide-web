import { z } from "zod";
import sanitizeHtml from "sanitize-html";

const seconds = z.number().finite().min(0).max(14400);
const safeId = z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/i);
const ease = z.enum(["linear","ease","ease-in","ease-out","ease-in-out","spring","cubic-bezier"]);
const transition = z.enum(["none","crossfade","push","wipe","zoom"]);
const property = z.union([z.number().finite(),z.string().max(100)]);
const frame = z.object({
  t: z.number().finite().min(0).max(1),
  target: z.string().regex(/^[.#a-zA-Z0-9 _-]+$/).max(120),
  props: z.record(z.string(),property),
  ease: ease.default("ease-out"),
  bezier: z.tuple([z.number(),z.number(),z.number(),z.number()]).optional()
}).strict();
export const sceneSchema = z.object({
  id: safeId, start: seconds, end: seconds,
  anchor: z.object({phrase:z.string().max(180).optional(),wordIndex:z.number().int().min(0).optional()}).strict().optional(),
  layer:z.enum(["overlay","fullframe","lowerthird"]).default("overlay"),
  html:z.string().max(20000),css:z.string().max(10000).default(""),
  keyframes:z.array(frame).max(80).default([]),
  transitionIn:transition.default("crossfade"),transitionOut:transition.default("crossfade"),
  motion:z.enum(["none","words","letters","mask","wipe","rise","slide","punch","highlight","underline","strike"]).default("none")
}).strict().refine(s=>s.end>s.start,{message:"Scene end must exceed start.",path:["end"]});
export const videoScenesSchema = z.object({
  tool:z.literal("video"),version:z.literal(2),kind:z.enum(["studio","producer"]),
  id:z.string().min(1).max(150),
  format:z.object({w:z.number().int().min(240).max(3840),h:z.number().int().min(240).max(3840),fps:z.number().int().min(15).max(60)}).strict(),
  assets:z.array(z.object({id:safeId,assetId:z.string().max(150).optional(),kind:z.enum(["graphic","logo","image"]),resolvedUrl:z.string().max(4000).optional()}).strict()).max(100),
  style:z.object({preset:z.enum(["apostolic","editorial","minimal"]).default("apostolic"),background:z.string().regex(/^(transparent|#[0-9a-fA-F]{3,8})$/).default("transparent"),accent:z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#A12D3D"),font:z.enum(["Montserrat","Bebas Neue","Playfair Display","Cormorant","Inter"]).default("Montserrat")}).strict(),
  scenes:z.array(sceneSchema).max(120),
  expectedUpdatedAt:z.string().datetime({offset:true}).optional()
}).strict().superRefine((v,ctx)=>{
  const ids=new Set<string>();
  for(let i=0;i<v.scenes.length;i++){
    const s=v.scenes[i];
    if(ids.has(s.id))ctx.addIssue({code:"custom",path:["scenes",i,"id"],message:"Scene IDs must be unique."});
    ids.add(s.id);
    if(s.css.match(/@import|@font-face|url\s*\(|expression\s*\(|behavior\s*:/i))
      ctx.addIssue({code:"custom",path:["scenes",i,"css"],message:"CSS cannot fetch remote resources or declare fonts."});
    if(!s.html.trim())ctx.addIssue({code:"custom",path:["scenes",i,"html"],message:"Scene HTML is empty."});
  }
});
export type VideoScenesDocument=z.infer<typeof videoScenesSchema>;
export type VideoScene=z.infer<typeof sceneSchema>;
export type VideoWord={word:string;start:number;end:number};
export const videoSceneTemplates:ReadonlyArray<{id:string;label:string;html:string;motion:VideoScene["motion"];layer:VideoScene["layer"]}>=[
 {id:"scripture",label:"Scripture reveal",html:"<div class='kicker'>SCRIPTURE</div><h1>The LORD our God is one LORD.</h1><p>Deuteronomy 6:4</p>",motion:"words",layer:"overlay"},
 {id:"statement",label:"Statement punch",html:"<h1>GOD IS ONE</h1>",motion:"punch",layer:"overlay"},
 {id:"question",label:"Question stack",html:"<div class='kicker'>CONSIDER THIS</div><h1>WHO IS JESUS?</h1>",motion:"rise",layer:"overlay"},
 {id:"split",label:"Split comparison",html:"<h1>ONE GOD</h1><p>One consistent confession</p>",motion:"wipe",layer:"fullframe"},
 {id:"lower",label:"Lower third",html:"<h2>APOSTOLIC GUIDE</h2><p>Scripture • Study • Truth</p>",motion:"slide",layer:"lowerthird"},
 {id:"list",label:"List build",html:"<h1>The witness</h1><p>One God</p><p>One Lord</p><p>One faith</p>",motion:"rise",layer:"overlay"},
 {id:"diagram",label:"Explainer diagram",html:"<h1>Word → Flesh</h1><p>John 1:1–14</p>",motion:"mask",layer:"fullframe"},
 {id:"cta",label:"CTA",html:"<h1>STUDY THE SCRIPTURES</h1><p>apostolicguide.com</p>",motion:"underline",layer:"fullframe"}
];
export function freshVideoScenes(kind:"studio"|"producer",id:string,duration=30):VideoScenesDocument{
 return {tool:"video",version:2,kind,id,format:{w:1080,h:1920,fps:30},assets:[],style:{preset:"apostolic",background:"transparent",accent:"#A12D3D",font:"Montserrat"},scenes:[],};
}
/** Output timestamps remain stable through content cuts. A vanished anchor rejects instead of drifting to unrelated text. */
export function resolveVideoSceneAnchors(doc:VideoScenesDocument,words:VideoWord[],keepSegments?:Array<{start:number;end:number}>):VideoScenesDocument{
 const outputTime=(source:number)=>{
  if(!keepSegments?.length)return source;
  let offset=0;
  for(const cut of keepSegments){
   if(source>=cut.start&&source<cut.end)return offset+(source-cut.start);
   offset+=cut.end-cut.start;
  }
  return null;
 };
 const normalized=words.map(w=>w.word.toLowerCase().replace(/[^a-z0-9]/g,""));
 const scenes=doc.scenes.map(scene=>{
  if(!scene.anchor)return scene;
  let index=scene.anchor.wordIndex;
  if(index===undefined&&scene.anchor.phrase){
   const tokens=scene.anchor.phrase.toLowerCase().split(/\s+/).map(w=>w.replace(/[^a-z0-9]/g,"")).filter(Boolean);
   index=words.findIndex((_,i)=>tokens.every((token,j)=>normalized[i+j]===token));
  }
  if(index===undefined||index<0||!words[index])throw new Error("Scene "+scene.id+": transcript anchor was not found.");
  const start=outputTime(words[index].start);
  if(start===null)throw new Error("Scene "+scene.id+": anchored word was removed by a cut.");
  const length=scene.end-scene.start;
  return {...scene,start,end:start+length};
 });
 return {...doc,scenes};
}
/** Project actual audible word positions through saved cuts; removes discarded audio words. */
export function videoOutputTranscriptWords(words:VideoWord[],keepSegments?:Array<{start:number;end:number}>):VideoWord[]{
 if(!keepSegments?.length)return words;
 let offset=0;const result:VideoWord[]=[];
 for(const segment of keepSegments){
  for(const word of words){
   if(word.start>=segment.end||word.end<=segment.start)continue;
   const start=offset+Math.max(0,word.start-segment.start);
   const end=offset+Math.min(segment.end,word.end)-segment.start;
   if(end>start)result.push({word:word.word,start,end});
  }
  offset+=segment.end-segment.start;
 }
 return result;
}
function cleanHtml(html:string){
 return sanitizeHtml(html,{
  allowedTags:["div","span","strong","em","b","i","small","h1","h2","h3","p","section","article","br","ul","li","img","svg","path","line","rect","circle"],
  allowedAttributes:{"*":["class","data-motion","aria-label"],img:["data-asset","alt"],svg:["viewBox"],path:["d","fill","stroke","stroke-width"],line:["x1","x2","y1","y2","stroke","stroke-width"],rect:["x","y","width","height","rx","fill"],circle:["cx","cy","r","fill"]},
  allowedSchemes:[],disallowedTagsMode:"discard"
 });
}
function scrub(value:string){return value.replace(/<\/style/gi,"").replace(/<\/script/gi,"").replace(/@import|@font-face|url\s*\(|expression\s*\(|behavior\s*:/gi,"");}
function safeJson(value:unknown){return JSON.stringify(value).replace(/</g,"\\u003c").replace(/>/g,"\\u003e").replace(/&/g,"\\u0026");}
export function videoSceneHtml(doc:VideoScenesDocument,options:{fontBase?:string;guides?:boolean;captionWords?:VideoWord[]}={}){
 const parsed=videoScenesSchema.parse(doc);
 const fontBase=options.fontBase??"/fonts/";
 const face=(family:string,file:string,weight:number)=>`@font-face{font-family:'${family}';src:url('${fontBase}${file}') format('woff');font-weight:${weight};font-display:block}`;
 const fonts=[face("Montserrat","montserrat-400.woff",400),face("Montserrat","montserrat-800.woff",800),face("Bebas Neue","bebas-400.woff",400),face("Cormorant","cormorant-700.woff",700),"@font-face{font-family:'Playfair Display';src:url('"+fontBase+"playfair-variable.ttf') format('truetype');font-weight:400 900;font-display:block}",face("Inter","inter-latin-800-normal.woff2",800)].join("");
 const layers=parsed.scenes.map(s=>`<section id="scene-${s.id}" data-scene="${s.id}" data-layer="${s.layer}" data-motion="${s.motion}" class="ag-scene">${cleanHtml(s.html)}</section>`).join("");
 const styles=parsed.scenes.map(s=>`#scene-${s.id}{${scrub(s.css)}}`).join("\n");
 const captionWords=(options.captionWords||[]).filter(w=>w.start>=0&&w.end>w.start).slice(0,4000);
 const guides=options.guides?'<div id="ag-guides" aria-hidden="true"></div>':"";
 const payload=safeJson({words:captionWords,scenes:parsed.scenes.map(s=>({...s,html:cleanHtml(s.html)})),assets:parsed.assets.filter(a=>a.resolvedUrl?.startsWith("https://")).map(a=>({id:a.id,url:a.resolvedUrl}))});
 return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
${fonts}*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent;color:#F5F7F4}
#ag-root{width:${parsed.format.w}px;height:${parsed.format.h}px;position:relative;background:${parsed.style.background};overflow:hidden}
.ag-scene{position:absolute;display:none;inset:0;padding:8%;align-items:center;justify-content:center;flex-direction:column;text-align:center;gap:24px;transform-origin:center}
.ag-scene[data-layer=lowerthird]{top:auto;bottom:7%;height:23%;inset-inline:6%;align-items:flex-start;text-align:left;background:linear-gradient(90deg,#10202AEF,#10202A88,transparent);padding:32px 44px;border-left:9px solid ${parsed.style.accent}}
.ag-scene[data-layer=fullframe]{background:#10202A}
.ag-scene h1{font:800 ${Math.round(parsed.format.w*.09)}px/1.02 '${parsed.style.font}',Montserrat,sans-serif;letter-spacing:-.035em;max-width:100%;margin:0;text-wrap:balance}
.ag-scene h2{font:800 ${Math.round(parsed.format.w*.047)}px/1.05 Montserrat,sans-serif;margin:0}
.ag-scene p{font:500 ${Math.round(parsed.format.w*.036)}px/1.3 Montserrat,sans-serif;max-width:90%;margin:0}
.ag-scene .kicker{font:800 ${Math.round(parsed.format.w*.027)}px/1.1 Montserrat,sans-serif;letter-spacing:.18em;color:${parsed.style.accent}}
.ag-unit{display:inline-block;white-space:pre}
#ag-captions{position:absolute;left:8%;right:8%;bottom:14%;min-height:110px;display:flex;justify-content:center;align-items:center;flex-wrap:wrap;gap:.3em;z-index:900;pointer-events:none;font:800 ${Math.round(parsed.format.w*.052)}px/1.15 'Montserrat',sans-serif;letter-spacing:-.025em;text-transform:uppercase;text-shadow:0 3px 12px #05131add}
#ag-captions .ag-word{padding:0 .05em;transition:none;white-space:nowrap}
#ag-captions .ag-word[aria-current=true]{color:${parsed.style.accent};text-shadow:0 2px 14px #000}
#ag-guides{position:absolute;pointer-events:none;inset:8%;border:2px dashed #FFFFFF33;z-index:999}
${styles}
</style></head><body><div id="ag-root">${layers}<div id="ag-captions" aria-live="off"></div>${guides}</div>
<script>const DATA=${payload};
function ease(x,kind,b){x=Math.max(0,Math.min(1,x));if(kind==='linear')return x;if(kind==='ease-in')return x*x;if(kind==='ease-in-out')return x*x*(3-2*x);if(kind==='spring')return 1-Math.exp(-8*x)*Math.cos(13*x);if(kind==='cubic-bezier'&&b){let t=x;for(let i=0;i<9;i++){const m=1-t,actual=3*m*m*t*b[0]+3*m*t*t*b[2]+t*t*t,derivative=3*m*m*b[0]+6*m*t*(b[2]-b[0])+3*t*t*(1-b[2]);if(Math.abs(derivative)<.00001)break;t=Math.max(0,Math.min(1,t-(actual-x)/derivative))}const m=1-t;return 3*m*m*t*b[1]+3*m*t*t*b[3]+t*t*t;}return 1-(1-x)*(1-x)}
function splitText(root,type){for(const el of root.querySelectorAll("h1,h2,h3,p,.kicker")){const text=el.textContent||'';el.textContent='';const parts=type==='letters'?[...text]:text.split(/(\\s+)/);for(const part of parts){const s=document.createElement('span');s.className='ag-unit';s.textContent=part;el.append(s)}}}
for(const s of DATA.scenes)if(s.motion==='words'||s.motion==='letters')splitText(document.getElementById('scene-'+s.id),s.motion);
const groups=[];for(let i=0;i<DATA.words.length;i+=5){groups.push(DATA.words.slice(i,i+5))}
const caption=document.getElementById('ag-captions');let shown=-1;
function renderCaptions(time){
let active=DATA.words.findIndex(w=>time>=w.start&&time<w.end);
if(active<0){const recent=DATA.words.findLastIndex(w=>time>=w.end&&time<w.end+.22);active=recent}
const groupIndex=active>=0?Math.floor(active/5):-1;
if(groupIndex!==shown){shown=groupIndex;caption.textContent='';if(groupIndex>=0)groups[groupIndex].forEach((w,i)=>{const el=document.createElement('span');el.className='ag-word';el.textContent=w.word;caption.append(el)})}
if(groupIndex<0)return;
const span=caption.children;groups[groupIndex].forEach((word,i)=>{const el=span[i],progress=Math.max(0,Math.min(1,(time-word.start)/.14));el.style.opacity=time<word.start?'0.28':'1';el.style.transform='translateY('+((1-progress)*14)+'px) scale('+(1+.10*(1-progress))+')';el.setAttribute('aria-current',String(active===groupIndex*5+i))})
}
const assetMap=new Map(DATA.assets.map(a=>[a.id,a.url]));for(const img of document.querySelectorAll('img[data-asset]')){const url=assetMap.get(img.getAttribute('data-asset'));if(url)img.src=url;else img.style.display='none'}
function render(time){renderCaptions(time);for(const s of DATA.scenes){const el=document.getElementById('scene-'+s.id);const on=time>=s.start&&time<s.end;el.style.display=on?'flex':'none';if(!on)continue;
const duration=Math.max(.001,s.end-s.start),p=(time-s.start)/duration,entrance=ease(Math.min(1,p/.16),'ease-out'),departure=ease(Math.min(1,(1-p)/.14),'ease-out');
let alpha=1,tx=0,scale=1,clip='inset(0 0 0 0)';
if(s.transitionIn==='crossfade')alpha*=entrance;if(s.transitionOut==='crossfade')alpha*=departure;
if(s.transitionIn==='push')tx=(1-entrance)*18;if(s.transitionOut==='push')tx-= (1-departure)*18;
if(s.transitionIn==='zoom')scale=0.88+.12*entrance;if(s.transitionOut==='zoom')scale*=.9+.1*departure;
if(s.transitionIn==='wipe')clip='inset(0 '+(100-entrance*100)+'% 0 0)';if(s.transitionOut==='wipe')clip='inset(0 0 0 '+(100-departure*100)+'%)';
if(s.motion==='rise')tx+=(1-entrance)*8;if(s.motion==='slide')tx+=(1-entrance)*20;
if(s.motion==='punch')scale*=1+.14*(1-ease(Math.min(1,p/.28),'spring'));
if(s.motion==='wipe'||s.motion==='mask')clip='inset(0 '+(100-100*ease(Math.min(1,p/.32),'ease-out'))+'% 0 0)';
el.style.opacity=alpha;el.style.transform='translateX('+tx+'%) scale('+scale+')';el.style.clipPath=clip;
const headline=el.querySelector('h1,h2,h3');
if(headline){const progress=ease(Math.min(1,p/.38),'ease-out');
if(s.motion==='highlight'){headline.style.background='linear-gradient(transparent 61%,#A12D3D 61%)';headline.style.backgroundSize=(progress*100)+'% 100%';headline.style.backgroundRepeat='no-repeat'}
if(s.motion==='underline'||s.motion==='strike'){headline.style.background='linear-gradient(#A12D3D,#A12D3D)';headline.style.backgroundRepeat='no-repeat';
headline.style.backgroundPosition=s.motion==='underline'?'left bottom':'left 58%';headline.style.backgroundSize=(progress*100)+'% 9px'}
}
const units=el.querySelectorAll('.ag-unit');units.forEach((u,i)=>{const amount=ease(Math.min(1,Math.max(0,(p-i*.027)/.16)),'ease-out');u.style.opacity=String(amount);u.style.transform='translateY('+((1-amount)*26)+'px)'});
const tracks=new Map();for(const f of s.keyframes){for(const k of Object.keys(f.props)){const id=f.target+'|'+k;if(!tracks.has(id))tracks.set(id,[]);tracks.get(id).push({t:f.t,value:f.props[k],ease:f.ease,bezier:f.bezier,target:f.target,key:k})}}
for(const track of tracks.values()){track.sort((a,b)=>a.t-b.t);let a=track[0],b=track[0];for(let i=0;i<track.length;i++){if(p>=track[i].t)a=track[i];if(track[i].t>=p){b=track[i];break}b=a}
const x=a===b?1:ease((p-a.t)/(b.t-a.t),b.ease,b.bezier);
let val=a.value;if(typeof a.value==='number'&&typeof b.value==='number')val=a.value+(b.value-a.value)*x;
const targets=el.querySelectorAll(a.target);targets.forEach(node=>{if(a.key==='opacity')node.style.opacity=String(val);else if(a.key==='scale')node.style.scale=String(val);else if(a.key==='x')node.style.translate=String(val)+'px 0';else if(a.key==='y')node.style.translate='0 '+String(val)+'px';else if(a.key==='rotate')node.style.rotate=String(val)+'deg';else if(/^(color|backgroundColor|filter|clipPath|letterSpacing)$/.test(a.key))node.style[a.key]=String(val)})}
}}window.__AGSeekFrame=render;window.addEventListener('message',ev=>{if(ev.data?.type==='ag-seek'&&Number.isFinite(ev.data.time))render(ev.data.time)});render(0);</script></body></html>`;
}

/** All words potentially seen or heard in the final export; HTML is reduced to actual visible text. */
export function videoScenesVisibleCopy(doc:VideoScenesDocument){
 return doc.scenes.map(scene=>({location:"Video scene "+scene.id,text:sanitizeHtml(scene.html,{allowedTags:[],allowedAttributes:{}}).replace(/&amp;/g,"&").trim()})).filter(line=>Boolean(line.text));
}

/** Signed URLs belong to the read/export projection only, never persisted as client-provided credentials. */
export function stripVideoSceneResolvedUrls(doc:VideoScenesDocument):VideoScenesDocument{
 return {...doc,assets:doc.assets.map(({resolvedUrl:_unused,...asset})=>asset)};
}
