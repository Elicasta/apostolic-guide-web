import type {VideoProducerBrandProfile} from "../video-producer-brand-profiles";
import {videoSceneDocument,type VideoSceneDocument} from "./video-scenes";

/** Start from data supplied by the brand table, not branches in the compositor. */
export function videoBrandSceneStarter(input:{
  profile:VideoProducerBrandProfile;
  projectId:string;
  kind:"producer"|"studio";
  mode:"podcast"|"reels";
  title:string;
  duration:number;
}):VideoSceneDocument {
 const {profile,projectId,kind,mode,title}=input;
 const duration=Math.max(1,Math.min(3600,Number.isFinite(input.duration)?input.duration:30));
 const vertical=mode==="reels";
 const intro=profile.config.bumpers.introSeconds;
 const outro=profile.config.bumpers.outroSeconds;
 const logoStart=Math.min(intro,duration/3);
 const outroStart=Math.max(logoStart,duration-outro);
 const overlays:NonNullable<VideoSceneDocument["overlays"]>=[];
 if(!vertical && intro>0)overlays.push({type:"intro",start:0,end:Math.min(intro,duration),text:title,position:"full",preset:"brand-intro"});
 overlays.push({type:"logo",start:logoStart,end:duration,position:"top-right",text:profile.config.logo.wordmark,preset:"brand-logo"});
 if(!vertical && outro>0 && outroStart<duration)overlays.push({type:"outro",start:outroStart,end:duration,position:"full",text:title,preset:"brand-outro"});
 if(vertical && duration>=12)overlays.push({type:"shortsEnd",start:Math.max(0,duration-2.5),end:duration,position:"center",text:"Full episode on my channel.",preset:"brand-shorts-end"});
 return videoSceneDocument.parse({
  tool:"video",version:2,kind,id:projectId,
  format:{w:vertical?1080:1920,h:vertical?1920:1080,fps:30},
  assets:[],style:{
   preset:profile.name,ink:profile.config.theme.ink,
   crimson:profile.config.theme.accent,paper:profile.config.theme.paper,
   fontFamily:profile.config.theme.fonts[0],brandSlug:profile.slug,
   logoAssetPath:profile.config.logo.assetPath
  },
  fields:{series:profile.name,episodeTitle:title,logo:profile.config.logo.wordmark,
   lowerThird:"",boxText:"",quote:"",kicker:"",label:""},
  templateHtml:"",themeCss:"",
  overlays,
  scenes:[{id:"scene-1",start:0,end:duration,layer:"overlay",html:"",css:"",keyframes:[]}]
 });
}
