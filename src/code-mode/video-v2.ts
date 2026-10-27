import { z } from "zod";
import sanitizeHtml from "sanitize-html";

const validSelector = /^(?:root|[.#][a-zA-Z][a-zA-Z0-9_-]*(?::nth-child\([1-9][0-9]?\))?)$/;
const animationProp = z.object({
  opacity: z.number().min(0).max(1).optional(),
  x: z.number().min(-2500).max(2500).optional(),
  y: z.number().min(-2500).max(2500).optional(),
  scale: z.number().min(0).max(5).optional(),
  rotation: z.number().min(-360).max(360).optional(),
  reveal: z.number().min(0).max(1).optional()
}).strict();
const easing = z.enum(["linear", "ease", "ease-in", "ease-out", "ease-in-out", "spring"]).or(z.string().regex(/^cubic-bezier\((-?(?:\d+(?:\.\d+)?|\.\d+),\s*){3}-?(?:\d+(?:\.\d+)?|\.\d+)\)$/));
const transition = z.object({
  type: z.enum(["none", "crossfade", "push", "wipe", "zoom"]),
  duration: z.number().min(0).max(3).default(0.3),
  ease: easing.default("ease-out")
}).strict();
const asset = z.object({ id: z.string().regex(/^[a-z][a-z0-9_-]{1,70}$/), kind: z.enum(["image", "video", "graphic", "font"]), storagePath: z.string().max(1200).optional() }).strict();
const frame = z.object({
  t: z.number().finite().min(0).max(7200),
  target: z.string().max(120).refine(s => validSelector.test(s), "Use root, #id or .class for animation targets"),
  props: animationProp,
  ease: easing.default("ease-out")
}).strict();
export const videoSceneV2 = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_-]{0,69}$/),
  start: z.number().finite().min(0).max(7200),
  end: z.number().finite().min(0).max(7200),
  anchor: z.object({ phrase: z.string().min(1).max(200).optional(), wordIndex: z.number().int().min(0).optional() }).strict().optional(),
  layer: z.enum(["overlay", "fullframe", "lowerthird"]),
  html: z.string().min(1).max(16000),
  css: z.string().max(16000),
  keyframes: z.array(frame).max(80).default([]),
  transitionIn: transition.optional(),
  transitionOut: transition.optional(),
  stagger: z.object({ mode: z.enum(["word", "letter"]), interval: z.number().min(0.01).max(0.5) }).optional()
}).strict().refine(s => s.end > s.start, { path: ["end"], message: "Scene end must be after start" }).refine(s => !/\@import|url\s*\(|expression\s*\(|behavior\s*:|@font-face|\\\\/i.test(s.css), { path: ["css"], message: "External CSS resources and escapes are prohibited" });
export const videoCodeV2Schema = z.object({
  tool: z.literal("video"),
  version: z.literal(2),
  kind: z.enum(["studio", "producer"]),
  id: z.string().min(1).max(120),
  format: z.object({ w: z.number().int().min(320).max(3840), h: z.number().int().min(320).max(3840), fps: z.union([z.literal(24), z.literal(25), z.literal(30), z.literal(60)]) }).strict(),
  assets: z.array(asset).max(100),
  style: z.record(z.string(), z.unknown()),
  scenes: z.array(videoSceneV2).max(80),
  expectedUpdatedAt: z.string().datetime({ offset: true }).optional()
}).strict().superRefine((doc, ctx) => {
  if (new Set(doc.scenes.map(s => s.id)).size !== doc.scenes.length) ctx.addIssue({ code: "custom", path: ["scenes"], message: "Scene IDs must be unique" });
  if (new Set(doc.assets.map(a => a.id)).size !== doc.assets.length) ctx.addIssue({ code: "custom", path: ["assets"], message: "Asset IDs must be unique" });
  if (doc.kind === "producer" && !z.string().uuid().safeParse(doc.id).success) ctx.addIssue({ code: "custom", path: ["id"], message: "Producer ID must be a UUID" });
  if (doc.kind === "studio" && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(doc.id)) ctx.addIssue({ code: "custom", path: ["id"], message: "Studio ID must be a pathway slug" });
  for (let i=0;i<doc.scenes.length;i++) {
    const scene=doc.scenes[i];
    if (scene.end-scene.start > 120) ctx.addIssue({ code: "custom", path: ["scenes",i,"end"], message: "Scene exceeds 120 seconds" });
    if (scene.keyframes.some(k => k.t > scene.end-scene.start)) ctx.addIssue({ code: "custom", path: ["scenes",i,"keyframes"], message: "Keyframe exceeds scene duration" });
  }
});
export type VideoCodeV2 = z.infer<typeof videoCodeV2Schema>;

const sceneMarkupOptions: sanitizeHtml.IOptions = {
  allowedTags: ["div", "span", "p", "h1", "h2", "h3", "small", "strong", "em", "b", "i", "mark", "br", "ul", "ol", "li"],
  allowedAttributes: { "*": ["class", "id", "data-motion", "aria-label"] },
  allowedSchemes: [],
  disallowedTagsMode: "discard"
};
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c));
const clamp = (v: number) => Math.max(0, Math.min(1, v));
function ease(t: number, kind: string): number {
  t=clamp(t);
  if (kind==="linear") return t;
  if (kind==="ease-in") return t*t*t;
  if (kind==="ease-out") return 1-Math.pow(1-t,3);
  if (kind==="ease-in-out") return t<0.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
  if (kind==="spring") return clamp(1-Math.exp(-7*t)*Math.cos(12*t));
  if (kind.startsWith("cubic-bezier")) {
    const values=(kind.match(/-?\d+(?:\.\d+)?/g)||[]).map(Number);
    if (values.length===4) {
      const [x1,y1,x2,y2]=values;
      const bez=(a:number,b:number,s:number)=>3*a*(1-s)**2*s+3*b*(1-s)*s*s+s**3;
      let lo=0,hi=1;
      for(let i=0;i<16;i++){const m=(lo+hi)/2;if(bez(x1,x2,m)<t)lo=m;else hi=m;}
      return clamp(bez(y1,y2,(lo+hi)/2));
    }
  }
  return 1-Math.pow(1-t,3);
}
function at(scene: VideoCodeV2["scenes"][number], target: string, time: number): Partial<Record<"opacity"|"x"|"y"|"scale"|"rotation"|"reveal",number>> {
  const frames=scene.keyframes.filter(k=>k.target===target).sort((a,b)=>a.t-b.t);
  if (!frames.length) return {};
  const t=Math.max(0,time-scene.start);
  if(t<=frames[0].t) return frames[0].props;
  if(t>=frames[frames.length-1].t) return frames[frames.length-1].props;
  const after=frames.findIndex(k=>k.t>t),a=frames[after-1],b=frames[after];
  const fraction=ease((t-a.t)/(b.t-a.t),b.ease);
  const props: Record<string,number>={};
  for(const name of ["opacity","x","y","scale","rotation","reveal"] as const) {
    const start=a.props[name],end=b.props[name];
    if(typeof start==="number" && typeof end==="number")props[name]=start+(end-start)*fraction;
    else if(typeof end==="number")props[name]=end;
    else if(typeof start==="number")props[name]=start;
  }
  return props;
}
function styleFor(props: ReturnType<typeof at>) {
  const x=props.x??0,y=props.y??0,scale=props.scale??1,rot=props.rotation??0;
  return `opacity:${props.opacity??1};transform:translate(${x}px,${y}px) scale(${scale}) rotate(${rot}deg);clip-path:inset(0 ${(1-(props.reveal??1))*100}% 0 0)`;
}
function transitionStyle(type: string, fraction: number) {
  const p=clamp(fraction);
  if(type==="push")return `transform:translateX(${(1-p)*100}%);opacity:${p}`;
  if(type==="wipe")return `clip-path:inset(0 ${(1-p)*100}% 0 0)`;
  if(type==="zoom")return `transform:scale(${1.14-0.14*p});opacity:${p}`;
  return `opacity:${p}`;
}
export type VideoWord = { word?: string; text?: string; start?: number; end?: number };
export function videoFrameHtml(doc: VideoCodeV2, seconds: number, guides=false, words: VideoWord[]=[]): string {
  const {w,h}=doc.format;
  const scenes=doc.scenes.filter(s=>seconds>=s.start && seconds<s.end);
  const markup=scenes.map(s=>{
    const className=`ag-scene-${s.id}`;
    const allTargets=[...new Set(s.keyframes.map(k=>k.target))];
    const animated=allTargets.filter(t=>t!=="root").map(t=>`.${className} ${t}{${styleFor(at(s,t,seconds))}}`).join("\n");
    let transition="";
    if(s.transitionIn && s.transitionIn.type!=="none" && seconds<s.start+s.transitionIn.duration)
      transition=transitionStyle(s.transitionIn.type,ease((seconds-s.start)/Math.max(.001,s.transitionIn.duration),s.transitionIn.ease));
    if(s.transitionOut && s.transitionOut.type!=="none" && seconds>s.end-s.transitionOut.duration)
      transition=transitionStyle(s.transitionOut.type,1-ease((seconds-(s.end-s.transitionOut.duration))/Math.max(.001,s.transitionOut.duration),s.transitionOut.ease));
    const staggerCss=s.stagger?Array.from({length:50},(_,i)=>{
      const active=ease((seconds-s.start-i*s.stagger!.interval)/0.26,"ease-out");
      return `.${className} .${s.stagger!.mode}:nth-child(${i+1}){opacity:${active};transform:translateY(${(1-active)*24}px);display:inline-block}`;
    }).join("\n"):"";
    return `<style>${s.css.replace(/<\/style/gi,"")}\n.${className}{${styleFor(at(s,"root",seconds))};${transition}}\n${animated}\n${staggerCss}</style><section class="ag-scene ${className} ${s.layer}">${sanitizeHtml(s.html,sceneMarkupOptions)}</section>`;
  }).join("\n");
  const bg=doc.style.background === "paper" ? "#F5F7F4" : doc.style.background === "ink" ? "#10202A" : "transparent";
  const captionWords=doc.style.kineticCaptions===true ? words.filter(w=>Number.isFinite(w.start)&&Number.isFinite(w.end)) : [];
  const wordIndex=captionWords.findIndex(w=>seconds>=Number(w.start)&&seconds<Number(w.end));
  const chunk=wordIndex>=0?Math.floor(wordIndex/5)*5:-1;
  const caption=chunk>=0?'<div class="ag-captions">'+captionWords.slice(chunk,chunk+5).map((w,i)=>{
   const offset=seconds-Number(w.start),active=chunk+i===wordIndex;
   const p=active?ease(offset/.14,"spring"):1;
   return '<span style="color:'+(active?"#F5F7F4":"#A2B2BD")+';background:'+(active?"#A12D3D":"transparent")+
    ';transform:scale('+(active?(.85+.15*p):1)+');opacity:'+(active?(0.4+0.6*p):.8)+'">'+esc(w.word||w.text||"")+"</span>";
  }).join(" ")+"</div>":"";
  const guide=guides?`<div class="ag-guides" aria-hidden="true"><div></div></div>`:"";
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data: 'self'; style-src 'unsafe-inline'"><style>
  *{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;overflow:hidden}body{background:${bg};color:#F5F7F4;font-family:'Montserrat',Arial,sans-serif}
  :root{--ag-paper:#F5F7F4;--ag-ink:#10202A;--ag-crimson:#A12D3D;--ag-muted:#66777D}
  .ag-frame{position:relative;width:${w}px;height:${h}px;overflow:hidden}
  .ag-scene{position:absolute;inset:0;overflow:hidden;display:grid;align-content:center;justify-items:center;padding:8%;text-align:center}
  .ag-scene.lowerthird{top:auto;height:33%;align-content:end;padding-bottom:8%}
  .ag-scene h1{font:800 clamp(34px,7vw,150px)/.95 'Montserrat',Arial,sans-serif;letter-spacing:-.04em;text-wrap:balance;margin:0}
  .ag-scene p{font-size:clamp(22px,3vw,52px);margin:1rem 0}
  .ag-scene mark{background:var(--ag-crimson);color:var(--ag-paper);padding:0 .15em}
  .ag-captions{position:absolute;bottom:10%;left:6%;right:6%;z-index:90;display:flex;justify-content:center;gap:.3em;flex-wrap:wrap;font:800 clamp(24px,5.2vw,98px)/1.1 Montserrat,sans-serif;text-align:center;text-shadow:0 3px 12px #10202A}\n  .ag-captions span{display:inline-block;padding:.07em .18em;border-radius:.08em}\n  .ag-guides{position:absolute;inset:5%;border:2px dashed #f5f7f480;pointer-events:none}.ag-guides div{position:absolute;inset:7%;border:1px dashed #f5f7f480}
  @font-face{font-family:Montserrat;src:url('/fonts/montserrat-400.woff') format('woff');font-weight:400}
  @font-face{font-family:Montserrat;src:url('/fonts/montserrat-800.woff') format('woff');font-weight:800}
  @font-face{font-family:Bebas;src:url('/fonts/bebas-400.woff') format('woff')}
  @font-face{font-family:Playfair;src:url('/fonts/cormorant-700.woff') format('woff');font-weight:700}
  </style></head><body><main class="ag-frame" aria-label="Scene preview">${markup}${caption}${guide}</main></body></html>`;
}
export function initialVideoV2(kind: "studio"|"producer"="studio",id=""): VideoCodeV2 {
  return { tool:"video", version:2, kind, id, format:{w:1080,h:1920,fps:30}, assets:[],style:{preset:"apostolic-guide",kineticCaptions:kind==="producer"},scenes:[] };
}
export const VIDEO_SCENE_TEMPLATES = [
  { id:"scripture", label:"Scripture reveal", layer:"overlay", html:'<div><small>SCRIPTURE</small><h1 class="headline">GOD IS ONE</h1><p class="support">Deuteronomy 6:4</p></div>' },
  { id:"statement", label:"Statement punch", layer:"overlay", html:'<div><h1 class="headline">ONE GOD.</h1><p class="support">ONE UNCHANGING TRUTH.</p></div>' },
  { id:"question", label:"Question stack", layer:"fullframe", html:'<div><p>WHO IS</p><h1 class="headline">JESUS?</h1></div>' },
  { id:"split", label:"Split comparison", layer:"fullframe", html:'<div class="split"><p>THE QUESTION</p><h1>THE ANSWER</h1></div>' },
  { id:"lowerthird", label:"Lower third", layer:"lowerthird", html:'<div><h2 class="headline">Elder Eli Castaneda</h2><p class="support">Apostolic Guide</p></div>' },
  { id:"list", label:"List build", layer:"fullframe", html:'<div><h1>THREE TRUTHS</h1><p class="word">ONE GOD</p><p class="word">ONE NAME</p><p class="word">ONE GOSPEL</p></div>' },
  { id:"diagram", label:"Explainer diagram", layer:"fullframe", html:'<div><h1 class="headline">WORD</h1><p>↓</p><h1 class="support">MADE FLESH</h1></div>' },
  { id:"cta", label:"Call to action", layer:"fullframe", html:'<div><h1 class="headline">STUDY THE SCRIPTURES</h1><p class="support">apostolicguide.com</p></div>' }
] as const;
export function insertVideoTemplate(doc: VideoCodeV2, template: (typeof VIDEO_SCENE_TEMPLATES)[number], start=0): VideoCodeV2 {
 const used=new Set(doc.scenes.map(s=>s.id));let id:string=template.id,index=2;while(used.has(id))id=template.id+"-"+index++;
 const scene=videoSceneV2.parse({ id,start,end:start+3,layer:template.layer,html:template.html,
 css:".headline{color:#F5F7F4}.support{color:#A12D3D}",
 keyframes:[{t:0,target:".headline",props:{opacity:0,y:64,scale:1.08},ease:"ease-out"},{t:.5,target:".headline",props:{opacity:1,y:0,scale:1},ease:"ease-out"}],
 transitionIn:{type:"crossfade",duration:.25,ease:"ease-out"},transitionOut:{type:"crossfade",duration:.3,ease:"ease-in"} });
 return {...doc,scenes:[...doc.scenes,scene]};
}

/** Translate anchors from source-aligned words through any cut map; suppress removed speech. */
export function resolveVideoSceneAnchors(doc:VideoCodeV2,words:VideoWord[],mapTime:(t:number)=>number|null=t=>t):VideoCodeV2 {
 const normalize=(v:string)=>v.toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
 const scenes=doc.scenes.flatMap(scene=>{
  if(!scene.anchor)return [scene];
  const anchor=scene.anchor;
  let index=anchor.wordIndex??-1;
  if(anchor.phrase){const phrase=normalize(anchor.phrase).split(" ");index=words.findIndex((_w,i)=>phrase.every((token,j)=>normalize(words[i+j]?.word||words[i+j]?.text||"")===token));}
  if(index<0||index>=words.length)return [];
  const t=Number(words[index].start);if(!Number.isFinite(t))return [];
  const mapped=mapTime(t);if(mapped==null||!Number.isFinite(mapped))return [];
  return [{...scene,start:mapped,end:mapped+scene.end-scene.start}];
 });
 return {...doc,scenes};
}
