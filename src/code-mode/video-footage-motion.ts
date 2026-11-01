import {videoSceneDocument,type VideoSceneDocument} from "./video-scenes";
/** FFmpeg crop/zoom applied to the actual A-roll, not the transparent motion layer. */
export function footageFilter(docInput:VideoSceneDocument){
 const doc=videoSceneDocument.parse(docInput);
 const {w,h,fps}=doc.format;
 const fit="fps="+fps+",scale="+w+":"+h+":force_original_aspect_ratio=increase,crop="+w+":"+h+",setsar=1";
 const punches=doc.scenes.filter(s=>s.transitionIn?.type==="punch"&&s.end>s.start+.1);
 if(!punches.length)return fit;
 const expressions=punches.map(s=>{
  const start=Math.round(s.start*fps);
  const frames=Math.max(6,Math.min(Math.round((s.end-s.start)*fps),Math.round(fps*1.2)));
  const end=start+frames;
  // Ease in and back out with zero motion at both boundaries.
  return "if(between(on,"+start+","+end+"),0.05*(0.5-0.5*cos(2*PI*(on-"+start+")/"+frames+")),0)";
 });
 const zoom="1+"+expressions.join("+");
 return fit+",zoompan=z='"+zoom+"':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s="+w+"x"+h+":fps="+fps;
}
