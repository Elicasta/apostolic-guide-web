#!/usr/bin/env node
/**
 * Deterministic scene-to-MP4 proof/composition worker.
 * Browser and Code Mode call the same renderVideoSceneFrame(doc, t, fonts).
 * Usage: node --import tsx scripts/render-video-code-mode.ts SCENE.json BASE.mp4 OUT.mp4 [startSeconds] [durationSeconds]
 */
import {readFile,rm,readdir} from "node:fs/promises";
import {spawnSync} from "node:child_process";
import {join,resolve} from "node:path";
import {tmpdir} from "node:os";
import {mkdtemp} from "node:fs/promises";
import {chromium} from "playwright";
import {videoSceneDocument} from "../src/code-mode/video-scenes";
import {renderVideoSceneFrame,type SceneFontMap} from "../src/code-mode/video-scene-frame";
import {footageFilter} from "../src/code-mode/video-footage-motion";

const fontNames:Record<keyof SceneFontMap,string>={
 montserrat400:"montserrat-400.woff",
 montserrat800:"montserrat-800.woff",
 bebas400:"bebas-400.woff",
 cormorant400:"cormorant-400.woff",
 cormorant700:"cormorant-700.woff",
 playfairVariable:"playfair-display-variable.ttf"
};
const safeNumber=(raw:string|undefined,fallback:number)=>{
 if(raw===undefined)return fallback;
 const n=Number(raw);if(!Number.isFinite(n)||n<0)throw new Error("Time must be a finite nonnegative number");
 return n;
};
async function fontMap(){
 const fontRoot=resolve(process.cwd(),"public/fonts");
 const fonts:SceneFontMap={};
 for(const [key,file] of Object.entries(fontNames)){
  fonts[key as keyof SceneFontMap]=(await readFile(join(fontRoot,file))).toString("base64");
 }
 return fonts;
}
async function graphicData(doc:ReturnType<typeof videoSceneDocument.parse>){
 const resolved:Record<string,string>={};
 for(const asset of doc.assets){
  if(!asset.resolvedUrl)throw new Error("Graphic "+asset.id+" has no signed render URL.");
  const url=new URL(asset.resolvedUrl);
  if(url.protocol!=="https:"||!(url.hostname==="blob.vercel-storage.com"||url.hostname.endsWith(".blob.vercel-storage.com")))
   throw new Error("Graphic URL is not on the trusted Vercel Blob storage host.");
  const res=await fetch(url,{signal:AbortSignal.timeout(60000)});
  if(!res.ok)throw new Error("Could not retrieve graphic "+asset.id+": "+res.status);
  const type=(res.headers.get("content-type")||"").split(";")[0];
  if(!["image/png","image/jpeg","image/webp"].includes(type))throw new Error("Graphic has unsupported content type.");
  const bytes=Buffer.from(await res.arrayBuffer());
  if(bytes.length<1||bytes.length>5*1024*1024)throw new Error("Graphic exceeds 5MB limit.");
  resolved[asset.id]="data:"+type+";base64,"+bytes.toString("base64");
 }
 return resolved;
}
function run(program:string,args:string[]){
 const proc=spawnSync(program,args,{stdio:"inherit",timeout:60*60*1000});
 if(proc.error)throw proc.error;
 if(proc.status!==0)throw new Error(program+" exited with "+proc.status);
}
export async function renderSceneVideo(args:string[]){
 if(args.length<3||args.length>5)throw new Error("Usage: render-video-code-mode.ts document.json base.mp4 output.mp4 [startSeconds] [durationSeconds]");
 const [documentPath,source,output]=args;
 const doc=videoSceneDocument.parse(JSON.parse(await readFile(documentPath,"utf-8")));
 const start=safeNumber(args[3],0);
 const total=Math.max(...doc.scenes.map(s=>s.end));
 const duration=safeNumber(args[4],total-start);
 if(duration<=0||duration>3600)throw new Error("Proof duration must be between 0 and 3600 seconds");
 const fps=doc.format.fps,count=Math.ceil(duration*fps);
 if(count>36000)throw new Error("Render exceeds 10 minutes at 60 FPS or equivalent frame budget");
 const sourceInspection=spawnSync("ffprobe",["-v","error","-show_streams","-show_format","-of","json",source],
  {encoding:"utf8",timeout:30000});
 if(sourceInspection.error||sourceInspection.status!==0)throw new Error("Could not inspect input footage");
 const baseInfo=JSON.parse(sourceInspection.stdout) as {format?:{duration?:string},streams?:Array<{codec_type?:string;duration?:string;nb_frames?:string}>};
 const inputVideo=baseInfo.streams?.find(s=>s.codec_type==="video");
 const inputAudio=baseInfo.streams?.find(s=>s.codec_type==="audio");
 const baseVideoLength=Number(inputVideo?.duration??baseInfo.format?.duration);
 const baseAudioLength=Number(inputAudio?.duration??baseInfo.format?.duration);
 console.log("Kinetic input media",JSON.stringify({requested:duration,start,videoSeconds:baseVideoLength,audioSeconds:baseAudioLength,sourceFrames:inputVideo?.nb_frames}));
 if(!inputVideo||!inputAudio||!Number.isFinite(baseVideoLength)||!Number.isFinite(baseAudioLength)||
    baseVideoLength<start+duration-.5||baseAudioLength<start+duration-.5)
  throw new Error("Source master is shorter than the requested kinetic segment");
 const dir=await mkdtemp(join(tmpdir(),"ag-motion-"));
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:doc.format.w,height:doc.format.h},deviceScaleFactor:1});
  const fonts=await fontMap();
  const images=await graphicData(doc);
  // Embed registered fonts and global CSS once. Recreating a whole Chromium
  // document for every 30 FPS frame reloads the same large font data hundreds
  // of times, making a normal 30-second reel unnecessarily expensive.
  await page.setContent(renderVideoSceneFrame(doc,start,fonts,images),{waitUntil:"load"});
  await page.evaluate(()=>document.fonts.ready);
  for(let frame=0;frame<count;frame++){
   const clock=start+frame/fps;
   const markup=renderVideoSceneFrame(doc,clock,{},images);
   const open=markup.indexOf("<body>"),close=markup.lastIndexOf("</body>");
   if(open<0||close<=open)throw new Error("Scene generator did not return an HTML body");
   const body=markup.slice(open+6,close);
   await page.evaluate(async html=>{
    document.body.innerHTML=html;
    await Promise.all(Array.from(document.images).map(img=>img.decode().catch(()=>{})));
   },body);
   await page.screenshot({path:join(dir,String(frame).padStart(6,"0")+".png"),omitBackground:true,animations:"disabled"});
   if(frame%30===0)process.stdout.write("Rendered "+frame+"/"+count+" frames\n");
  }
  await page.close();
  const pngCount=(await readdir(dir)).filter(file=>/^[0-9]{6}[.]png$/.test(file)).length;
  if(pngCount!==count)throw new Error("Frame generator was incomplete: expected "+count+", got "+pngCount);
  // Overlay is a transparent RGBA PNG stream. Preserve the existing finished
  // master's audio without a second audio mastering pass.
  const input=resolve(source);
  const result=resolve(output);
  const pattern=join(dir,"%06d.png");
  if(process.env.CI && duration<=5){
   const colorTypes:Record<number,number>={};
   const sizes:Record<string,number>={};
   for(let i=0;i<count;i++){
    const png=await readFile(join(dir,String(i).padStart(6,"0")+".png"));
    const type=png[25];
    colorTypes[type]=(colorTypes[type]??0)+1;
    const shape=png.readUInt32BE(16)+"x"+png.readUInt32BE(20);
    sizes[shape]=(sizes[shape]??0)+1;
   }
   console.log("Motion PNG diagnostics",JSON.stringify({frames:count,colorTypes,sizes}));
   run("ffmpeg",["-hide_banner","-loglevel","info","-framerate",String(fps),"-i",pattern,
     "-frames:v",String(count),"-f","null","-"]);
   run("ffmpeg",["-hide_banner","-loglevel","info","-ss",String(start),"-i",input,
     "-vf",footageFilter(doc),"-an","-frames:v",String(count),"-f","null","-"]);
  }
  run("ffmpeg",[
   "-y","-hide_banner","-loglevel","error",
   "-ss",String(start),"-i",input,
   "-framerate",String(fps),"-i",pattern,
   "-filter_complex",
   "[0:v]"+footageFilter(doc)+",setpts=N/("+fps+"*TB)[base];[1:v]setpts=N/("+fps+"*TB),format=rgba[graphics];[base][graphics]overlay=shortest=0:eof_action=pass:repeatlast=0:format=auto,format=yuv420p,setpts=N/("+fps+"*TB)[composite]",
   "-map","[composite]","-map","0:a?",
   "-fps_mode:v","passthrough","-frames:v",String(count),"-t",String(duration),
   "-c:v","libx264","-preset","superfast","-crf","18","-pix_fmt","yuv420p",
   "-c:a","copy","-movflags","+faststart",result
  ]);
  // Do not trust a zero exit code: FFmpeg's -shortest used to silently truncate
  // 30-second reels to ~18 seconds. Inspect the encoded media before success.
  const inspection=spawnSync("ffprobe",["-v","error","-show_streams","-show_format","-of","json",result],{encoding:"utf8",timeout:30000});
  if(inspection.error||inspection.status!==0)throw new Error("Could not probe composited MP4");
  const probed=JSON.parse(inspection.stdout) as {streams?:Array<{codec_type?:string;duration?:string;nb_frames?:string}>,format?:{duration?:string}};
  const video=probed.streams?.find(s=>s.codec_type==="video");
  const audio=probed.streams?.find(s=>s.codec_type==="audio");
  const tolerance=Math.max(.45,duration*.01);
  const vd=Number(video?.duration??probed.format?.duration),ad=Number(audio?.duration);
  if(!video||!audio||!Number.isFinite(vd)||!Number.isFinite(ad)||vd<duration-tolerance||ad<duration-tolerance)
   throw new Error("Composited MP4 is truncated: expected "+duration+"s, video "+vd+"s, audio "+ad+"s");
  return {frames:count,fps,start,duration,output:result};
 }finally{
  await browser.close();
  await rm(dir,{recursive:true,force:true});
 }
}
if(process.argv[1]?.includes("render-video-code-mode")){
 renderSceneVideo(process.argv.slice(2)).then(result=>process.stdout.write(JSON.stringify(result)+"\n")).catch(error=>{console.error(error);process.exitCode=1});
}
