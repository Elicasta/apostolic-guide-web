import {mkdtemp,readdir,readFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import sharp from "sharp";
import {freshVideoScenes,videoScenesSchema} from "../src/video-scenes";
import {renderSceneFrames} from "./render_video_scene_frames";

async function main(){
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
 const movie=join(folder,"proof.mp4");
 execFileSync("ffmpeg",["-hide_banner","-loglevel","error","-y","-f","lavfi",
 "-i","color=c=0x10202A:s=480x854:r=15:d=1.5",
 "-framerate","15","-i",join(folder,"frame-%06d.png"),
 "-filter_complex","[0:v][1:v]overlay=0:0:eof_action=pass:repeatlast=0,format=yuv420p[v]",
 "-map","[v]","-an","-t","1.5","-c:v","libx264","-preset","ultrafast","-crf","21",movie],
 {stdio:"pipe",timeout:120000});
 const probe=JSON.parse(execFileSync("ffprobe",["-v","error","-select_streams","v:0",
 "-show_entries","stream=width,height,r_frame_rate","-of","json",movie],{encoding:"utf8"}));
 if(probe.streams?.[0]?.width!==480||probe.streams?.[0]?.height!==854||probe.streams?.[0]?.r_frame_rate!=="15/1")
  throw new Error("Final MP4 stream differs from preview geometry.");
 const still=join(folder,"composited-09.png");
 execFileSync("ffmpeg",["-hide_banner","-loglevel","error","-y","-ss","0.6","-i",movie,"-frames:v","1",still]);
 const pixels=await sharp(still).stats();
 if(pixels.channels.slice(0,3).every(ch=>ch.stdev<2))throw new Error("Encoded MP4 lost kinetic text.");
 process.stdout.write("Kinetic screenshot + MP4 proof PASS: 23 frames, 480x854@15fps.\\n");
}finally{await rm(folder,{recursive:true,force:true})}
}

void main().catch(error=>{console.error(error);process.exitCode=1});
