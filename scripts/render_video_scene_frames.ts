/** Deterministic Chromium frame exporter. Runs on the same HTML/seek function as Code Mode. */
import {mkdtemp,readFile,writeFile,mkdir,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {resolve,join} from "node:path";
import {pathToFileURL} from "node:url";
import {chromium} from "playwright";
import {videoScenesSchema,videoSceneHtml,resolveVideoSceneAnchors,videoOutputTranscriptWords,type VideoScenesDocument} from "../src/video-scenes";

export async function renderSceneFrames(input:{
 document:VideoScenesDocument;words?:Array<{word:string;start:number;end:number}>;
 keepSegments?:Array<{start:number;end:number}>;outputDuration:number;
 destination:string;proof?:{start:number;duration:number}
}){
 const doc=resolveVideoSceneAnchors(videoScenesSchema.parse(input.document),input.words||[],input.keepSegments);
 const captionWords=videoOutputTranscriptWords(input.words||[],input.keepSegments);
 const {w,h,fps}=doc.format,full=Math.max(0,input.outputDuration);
 if(!Number.isFinite(full)||full<=0||full>14400)throw new Error("Invalid output duration.");
 const start=Math.max(0,input.proof?.start??0),duration=Math.min(input.proof?.duration??full,full-start);
 if(duration<=0)throw new Error("Empty proof interval.");
 if(Math.ceil(duration*fps)>30000)throw new Error("Proof exceeds frame budget.");
 await mkdir(input.destination,{recursive:true});
 const temp=await mkdtemp(join(tmpdir(),"ag-motion-html-"));
 const file=join(temp,"frame.html");
 const base=pathToFileURL(resolve("public/fonts")+ "/").href;
 await writeFile(file,videoSceneHtml(doc,{fontBase:base,captionWords}),"utf8");
 const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage","--disable-background-networking","--allow-file-access-from-files"]});
 try{
  const page=await browser.newPage({viewport:{width:w,height:h},deviceScaleFactor:1});
  await page.goto(pathToFileURL(file).href,{waitUntil:"load"});
  await page.evaluate(()=>document.fonts.ready);
  await page.evaluate(async()=>{await Promise.all(Array.from(document.images).map(img=>img.decode().catch(()=>{})))});
  for(let i=0;i<Math.ceil(duration*fps);i++){
   const t=start+i/fps;
   await page.evaluate((value:number)=>(window as unknown as {__AGSeekFrame:(t:number)=>void}).__AGSeekFrame(value),t);
   await page.screenshot({path:join(input.destination,`frame-${String(i).padStart(6,"0")}.png`),type:"png",omitBackground:true});
   if(i%150===0)process.stdout.write(`motion frames ${i+1}/${Math.ceil(duration*fps)}\n`);
  }
 }finally{await browser.close();await rm(temp,{recursive:true,force:true})}
 return {frames:Math.ceil(duration*fps),fps,duration};
}
async function main(){
 const [manifestFile,destination,proofStart,proofDuration]=process.argv.slice(2);
 if(!manifestFile||!destination)throw new Error("usage: node --import tsx scripts/render_video_scene_frames.ts manifest.json frames-dir [start] [duration]");
 const manifest=JSON.parse(await readFile(manifestFile,"utf8"));
 if(!manifest.sceneProgram)throw new Error("No scene program in render manifest.");
 await renderSceneFrames({document:manifest.sceneProgram,words:manifest.renderPlan?.captions?.enabled===false?[]:manifest.transcript?.words||[],
  keepSegments:manifest.renderPlan?.keepSegments,outputDuration:manifest.renderPlan?.outputDuration||manifest.duration,
  destination,proof:proofStart!==undefined?{start:Number(proofStart),duration:Number(proofDuration)||8}:undefined});
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(new URL(import.meta.url).pathname))main().catch(e=>{console.error(e);process.exitCode=1});
