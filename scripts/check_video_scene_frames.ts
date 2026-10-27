import {mkdtemp,readdir,readFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createHash} from "node:crypto";
import sharp from "sharp";
import {freshVideoScenes,videoScenesSchema} from "../src/video-scenes";
import {renderSceneFrames} from "./render_video_scene_frames";

const folder=await mkdtemp(join(tmpdir(),"ag-motion-smoke-"));
try{
 const program=videoScenesSchema.parse({...freshVideoScenes("producer","11111111-1111-4111-8111-111111111111"),
  format:{w:480,h:854,fps:15},scenes:[{id:"statement",start:.2,end:1.2,layer:"overlay",html:"<h1>ONE GOD</h1>",css:"",
   keyframes:[],transitionIn:"crossfade",transitionOut:"crossfade",motion:"punch"}]});
 await renderSceneFrames({document:program,outputDuration:1.5,destination:folder});
 const files=(await readdir(folder)).filter(s=>s.endsWith(".png")).sort();
 if(files.length!==23)throw new Error("Expected 23 deterministic screenshot frames; got "+files.length);
 const samples=await Promise.all([files[0],files[9]].map(async name=>{
  const bytes=await readFile(join(folder,name));
  const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  let visible=0;for(let i=3;i<data.length;i+=info.channels)if(data[i]>50)visible++;
  return {sha:createHash("sha256").update(bytes).digest("hex"),visible};
 }));
 if(samples[0].visible!==0||samples[1].visible<300||samples[0].sha===samples[1].sha)
  throw new Error("Kinetic scene failed deterministic alpha/difference checks "+JSON.stringify(samples));
 process.stdout.write("Kinetic screenshot proof PASS: 23 frames, transparent idle, animated visible scene.\n");
}finally{await rm(folder,{recursive:true,force:true})}
