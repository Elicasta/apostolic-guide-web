import {z} from "zod";

/**
 * Video scene document V2. Times are seconds, while keyframe t is seconds relative
 * to the scene. Validate before either browser playback or an export worker consumes it.
 */
const finite=z.number().finite();
const positive=finite.positive();
const color=z.string().regex(/^#[0-9a-fA-F]{6}$/);
const transform=z.object({
  x:finite.min(-5000).max(5000).optional(),
  y:finite.min(-5000).max(5000).optional(),
  scale:finite.min(0).max(10).optional(),
  opacity:finite.min(0).max(1).optional(),
  rotate:finite.min(-720).max(720).optional(),
  clip:finite.min(0).max(100).optional()
}).strict();
export const videoEase=z.union([
 z.enum(["linear","ease","ease-in","ease-out","ease-in-out","spring"]),
 z.string().regex(/^cubic-bezier\(\s*-?\d*(?:\.\d+)?\s*,\s*-?\d*(?:\.\d+)?\s*,\s*-?\d*(?:\.\d+)?\s*,\s*-?\d*(?:\.\d+)?\s*\)$/)
]);
const keyframe=z.object({t:finite.min(0),target:z.string().regex(/^[a-zA-Z][\w-]{0,63}$/),props:transform,ease:videoEase.default("ease")}).strict();
const transition=z.object({type:z.enum(["none","crossfade","push","wipe","zoom","punch"]),duration:finite.min(0).max(5).default(.4),ease:videoEase.default("ease")}).strict();
const anchor=z.object({phrase:z.string().min(1).max(400).optional(),wordIndex:z.number().int().min(0).optional()}).strict().refine(v=>v.phrase!==undefined||v.wordIndex!==undefined,"Provide a phrase or wordIndex");
const asset=z.object({id:z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),kind:z.enum(["image","video","font","graphic"]),storageLocator:z.string().max(1000).optional(),resolvedUrl:z.string().max(4096).optional()}).strict();
const scene=z.object({
 id:z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
 start:finite.min(0),
 end:positive,
 anchor:anchor.optional(),
 layer:z.enum(["overlay","fullframe","lowerthird"]),
 html:z.string().max(12000),
 css:z.string().max(12000),
 keyframes:z.array(keyframe).max(250).default([]),
 transitionIn:transition.optional(),
 transitionOut:transition.optional()
}).strict().superRefine((value,ctx)=>{
 if(value.end<=value.start)ctx.addIssue({code:"custom",path:["end"],message:"Scene end must exceed start"});
 for(let i=0;i<value.keyframes.length;i++)if(value.keyframes[i].t>value.end-value.start)ctx.addIssue({code:"custom",path:["keyframes",i,"t"],message:"Keyframe exceeds scene duration"});
 // Scene HTML is inert markup, not arbitrary JavaScript. Never load remote resources.
 const combined=value.html+"\n"+value.css;
 if(/<\s*(script|iframe|object|embed|video|audio|link|meta|base)\b/i.test(combined)||/\bon\w+\s*=/i.test(combined)||/javascript\s*:|@import\b|url\s*\(/i.test(combined))
   ctx.addIssue({code:"custom",path:["html"],message:"Executable markup and external resources are forbidden"});
});
export const videoSceneDocument=z.object({
 tool:z.literal("video"),version:z.literal(2),
 kind:z.enum(["studio","producer"]),
 id:z.string().min(1).max(120),
 format:z.object({w:z.number().int().min(320).max(7680),h:z.number().int().min(320).max(7680),fps:z.number().int().min(12).max(120)}).strict(),
 assets:z.array(asset).max(100).default([]),
 style:z.object({preset:z.string().min(1).max(100),ink:color.default("#10202A"),paper:color.default("#F5F7F4"),crimson:color.default("#A12D3D")}).passthrough(),
 scenes:z.array(scene).min(1).max(120),
 expectedUpdatedAt:z.string().datetime({offset:true}).optional()
}).strict().superRefine((value,ctx)=>{
 const ids=new Set<string>();
 value.scenes.forEach((s,i)=>{
  if(ids.has(s.id))ctx.addIssue({code:"custom",path:["scenes",i,"id"],message:"Duplicate scene ID"});
  ids.add(s.id);
  if(i>0&&s.start<value.scenes[i-1].start)ctx.addIssue({code:"custom",path:["scenes",i,"start"],message:"Scenes must be in start order"});
 });
 const assetIds=new Set<string>();
 value.assets.forEach((a,i)=>{if(assetIds.has(a.id))ctx.addIssue({code:"custom",path:["assets",i,"id"],message:"Duplicate asset ID"});assetIds.add(a.id)});
});
export type VideoSceneDocument=z.infer<typeof videoSceneDocument>;
export type VideoScene=VideoSceneDocument["scenes"][number];

/** Stable across browsers and workers, including spring easing. */
export function easingAt(ease:string,t:number){
 const x=Math.min(1,Math.max(0,t));
 if(ease==="linear")return x;
 if(ease==="ease-in")return x*x;
 if(ease==="ease-out")return 1-(1-x)*(1-x);
 if(ease==="ease-in-out")return x*x*(3-2*x);
 if(ease==="spring")return 1-Math.exp(-7*x)*Math.cos(12*x)*(1-x);
 const match=/^cubic-bezier\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)$/.exec(ease);
 const p=match?match.slice(1).map(Number):[.25,.1,.25,1];
 const bez=(t:number,a:number,b:number)=>3*(1-t)*(1-t)*t*a+3*(1-t)*t*t*b+t*t*t;
 let lo=0,hi=1;
 for(let i=0;i<26;i++){const mid=(lo+hi)/2;if(bez(mid,p[0],p[2])<x)lo=mid;else hi=mid}
 return bez((lo+hi)/2,p[1],p[3]);
}
export function sceneAt(doc:VideoSceneDocument,time:number){return doc.scenes.filter(s=>s.start<=time&&time<s.end)}
export function propsAt(scene:VideoScene,target:string,time:number){
 const frames=scene.keyframes.filter(k=>k.target===target).sort((a,b)=>a.t-b.t);
 if(!frames.length)return {};
 const relative=Math.max(0,time-scene.start);
 if(relative<=frames[0].t)return frames[0].props;
 if(relative>=frames[frames.length-1].t)return frames[frames.length-1].props;
 const i=frames.findIndex(k=>k.t>relative),a=frames[i-1],b=frames[i];
 const amount=easingAt(b.ease,(relative-a.t)/(b.t-a.t));
 const values:Record<string,number>={};
 for(const key of new Set([...Object.keys(a.props),...Object.keys(b.props)])){
  const prop=key as keyof typeof a.props;
  const start=a.props[prop]??(key==="opacity"||key==="scale"?1:0),end=b.props[prop]??start;
  values[key]=start+(end-start)*amount;
 }
 return values;
}
export function videoSceneStarter(id:string,layer:VideoScene["layer"]="overlay"):VideoScene{
 return {id,start:0,end:3,layer,html:'<div data-motion="title" class="motion-title">JESUS IS GOD</div>',css:'.motion-title{font-family:Montserrat,sans-serif;font-weight:900;font-size:8cqw;text-align:center;color:#F5F7F4}',keyframes:[
 {t:0,target:"title",props:{opacity:0,y:80,scale:.9},ease:"ease-out"},
 {t:.5,target:"title",props:{opacity:1,y:0,scale:1},ease:"spring"}
 ],transitionIn:{type:"crossfade",duration:.3,ease:"ease-out"}};
}
