import {videoSceneDocument,sceneAt,propsAt,easingAt,type VideoSceneDocument,type VideoScene} from "./video-scenes";

export type SceneFontMap=Partial<Record<"montserrat400"|"montserrat800"|"bebas400"|"cormorant400"|"cormorant700",string>>;
function htmlEscape(s:string){return s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]||c));}
function cssEscape(s:string){return s.replace(/["\\]/g,c=>"\\"+c);}
function fontsCss(fonts:SceneFontMap){
 const items:[keyof SceneFontMap,string,number][]=[
 ["montserrat400","Montserrat",400],["montserrat800","Montserrat",800],["bebas400","Bebas Neue",400],["cormorant400","Cormorant Garamond",400],["cormorant700","Cormorant Garamond",700]];
 return items.flatMap(([key,family,weight])=>{
  const value=fonts[key];if(!value||!/^[A-Za-z0-9+/=]+$/.test(value))return [];
  const ext=key.startsWith("montserrat")||key.startsWith("bebas")||key.startsWith("cormorant")?"woff":"woff";
  return ['@font-face{font-family:"'+cssEscape(family)+'";font-weight:'+weight+';src:url(data:font/'+ext+';base64,'+value+') format("woff");font-display:block}'];
 }).join("\n");
}
function transitionOpacity(scene:VideoScene,time:number){
 let alpha=1;
 const a=scene.transitionIn,b=scene.transitionOut;
 if(a&&a.type!=="none"&&a.duration>0&&time<scene.start+a.duration)
  alpha=Math.min(alpha,easingAt(a.ease,(time-scene.start)/a.duration));
 if(b&&b.type!=="none"&&b.duration>0&&time>scene.end-b.duration)
  alpha=Math.min(alpha,easingAt(b.ease,(scene.end-time)/b.duration));
 return Math.min(1,Math.max(0,alpha));
}
function decoratedHtml(scene:VideoScene,time:number){
 let html=scene.html;
 const targets=[...new Set(scene.keyframes.map(k=>k.target))];
 for(const target of targets){
  const p=propsAt(scene,target,time) as Record<string,number>;
  const css=[
    "opacity:"+Math.min(1,Math.max(0,p.opacity??1)),
    "transform:translate("+Number(p.x||0)+"px,"+Number(p.y||0)+"px) rotate("+Number(p.rotate||0)+"deg) scale("+Number(p.scale??1)+")",
    "clip-path:inset(0 "+(100-Math.min(100,Math.max(0,Number(p.clip??100))))+"% 0 0)"
  ].join(";");
  html=html.replace(new RegExp('data-motion=["\\x27]'+target+'["\\x27]','g'),match=>match+' style="'+css+'"');
 }
 return html;
}
export function renderVideoSceneFrame(input:VideoSceneDocument,time:number,fonts:SceneFontMap={},imageData:Record<string,string>={}){
 // Parse again even when input came from a caller claiming to be typed.
 const doc=videoSceneDocument.parse(input);
 if(!Number.isFinite(time)||time<0)throw new Error("Invalid frame time");
 const scenes=sceneAt(doc,time);
 const body=scenes.map((scene,i)=>{
  const opacity=transitionOpacity(scene,time);
  let markup=decoratedHtml(scene,time);
  markup=markup.replace(/<img\b[^>]*\bdata-asset-id=["']([a-zA-Z0-9_-]+)["'][^>]*>/gi,(tag,id:string)=>{
   if(!doc.assets.some(a=>a.id===id)||!imageData[id])return tag;
   const data=imageData[id];
   if(!/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(data))throw new Error("Invalid registered image data");
   return tag.replace(/\s+src\s*=\s*(?:"[^"]*"|'[^']*')/gi,"").replace(/\s*\/?>(?=$)/,' src="'+data+'">');
  });
  return '<section data-scene="'+htmlEscape(scene.id)+'" class="ag-scene ag-'+scene.layer+'" style="opacity:'+opacity+'">'+
     markup+'</section><style data-scene-style="'+i+'">'+scene.css+'</style>';
 }).join("");
 const css='*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}'+
 'body{container-type:inline-size;font-family:"Montserrat",Arial,sans-serif;color:'+doc.style.paper+'}'+
 '.ag-scene{position:absolute;inset:0;display:grid;place-items:center;overflow:hidden}'+
 '.ag-fullframe{background:'+doc.style.ink+'}.ag-overlay{background:transparent}'+
 '.ag-lowerthird{inset:64% 5% 8%}.ag-lowerthird>div{width:100%}';
 return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
 '<meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; img-src data:; font-src data:; style-src &#39;unsafe-inline&#39;; script-src &#39;none&#39;">'+
 '<style>'+fontsCss(fonts)+css+'</style></head><body>'+body+'</body></html>';
}
