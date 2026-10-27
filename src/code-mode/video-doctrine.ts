import "server-only";
import sanitizeHtml from "sanitize-html";
import {textDoctrineSource} from "../doctrine-gate";
import {videoCodeV2Schema} from "./video-v2";
import type {VideoProducerTranscript} from "../video-producer-ai";

/** Single review surface for what the video actually says and displays.
 * HTML is reduced to readable text, and captions inherit the spoken transcript.
 * CSS generated text is rejected by the scene schema, not trusted as invisible. */
export function videoCodeDoctrineSource(projectId:string,doc:unknown,transcript:unknown) {
 const scenes=videoCodeV2Schema.parse(doc).scenes;
 const words=(transcript as Partial<VideoProducerTranscript>|null)?.words||[];
 const spoken=words.map(w=>w.word).join(" ");
 const fields:Record<string,string>={spokenTranscript:spoken,kineticCaptions:spoken};
 scenes.forEach((scene,index)=>{
  const text=sanitizeHtml(scene.html,{allowedTags:[],allowedAttributes:{}}).replace(/\s+/g," ").trim();
  fields["scene_"+String(index+1).padStart(2,"0")+"_"+scene.id]=text;
 });
 return textDoctrineSource("video_clip",projectId,fields);
}
