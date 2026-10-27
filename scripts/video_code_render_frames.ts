#!/usr/bin/env node
/**
 * Produce deterministic transparent scene plates from the exact HTML compiler used
 * by Video Code Mode's preview. The Python worker applies them over its master.
 * Usage: node --import tsx scripts/video_code_render_frames.ts <document.json> <outdir> <duration>
 */
import {readFile,mkdir,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {chromium} from "playwright";
import {videoCodeV2Schema,videoFrameHtml} from "../src/code-mode/video-v2";

async function main(){
 const [manifestPath,folder,rawDuration]=process.argv.slice(2);
 if(!manifestPath||!folder||!rawDuration)throw new Error("Expected document.json, folder and duration");
 const input=JSON.parse(await readFile(manifestPath,"utf8"));
 const doc=videoCodeV2Schema.parse(input.document||input);
 const words=Array.isArray(input.words)?input.words:[];
 const assetSources:Record<string,string>={};
 const chosen=new Set(doc.assets.map(asset=>asset.id));
 const entries=Object.entries(input.assetUrls||{}) as Array<[string,unknown]>;
 if(entries.length>20)throw new Error("Too many motion graphics assets");
 for(const [id,rawUrl] of entries){
   if(!chosen.has(id))throw new Error("Unregistered motion asset");
   if(typeof rawUrl!=="string" || !rawUrl.startsWith("https://"))throw new Error("Motion asset URL not HTTPS");
   const response=await fetch(rawUrl,{redirect:"error",signal:AbortSignal.timeout(30000)});
   if(!response.ok)throw new Error("Could not fetch registered graphic asset");
   const mime=response.headers.get("content-type")?.split(";")[0]||"";
   if(!["image/png","image/jpeg","image/webp"].includes(mime))throw new Error("Unsupported graphic MIME type");
   const bytes=Buffer.from(await response.arrayBuffer());
   if(bytes.length>6*1024*1024)throw new Error("Graphic asset exceeds 6MB");
   assetSources[id]="data:"+mime+";base64,"+bytes.toString("base64");
 }
 const duration=Number(rawDuration);
 if(!Number.isFinite(duration)||duration<=0||duration>7200)throw new Error("Invalid render duration");
 if(doc.format.fps!==30)throw new Error("Video Producer output currently requires 30 fps");
 const root=resolve(process.cwd());
 const fonts=[
  ["/fonts/montserrat-400.woff","font/woff"],["/fonts/montserrat-800.woff","font/woff"],
  ["/fonts/bebas-400.woff","font/woff"],["/fonts/cormorant-700.woff","font/woff"]
 ];
 const fontData=new Map<string,string>();
 for(const [url,mime] of fonts)fontData.set(url,`data:${mime};base64,${(await readFile(resolve(root,"public"+url))).toString("base64")}`);
 const inline=(html:string)=>html.replace(/url\('(\/fonts\/[^']+)'\)/g,(_all,url)=>`url('${fontData.get(url)||""}')`);
 await mkdir(folder,{recursive:true});
 const browser=await chromium.launch({headless:true,args:["--disable-dev-shm-usage","--no-sandbox","--disable-extensions"]});
 try{
  const page=await browser.newPage({viewport:{width:doc.format.w,height:doc.format.h},deviceScaleFactor:1,javaScriptEnabled:false,serviceWorkers:"block"});
  await page.route("**/*",route=>route.abort());
  const frameCount=Math.ceil(duration*doc.format.fps);
  const start=Date.now();
  for(let i=0;i<frameCount;i++){
   const html=inline(videoFrameHtml(doc,i/doc.format.fps,false,words,assetSources));
   await page.setContent(html,{waitUntil:"load"});
   await page.evaluate(()=>document.fonts.ready);
   await page.screenshot({path:resolve(folder,`${String(i).padStart(6,"0")}.png`),omitBackground:true,animations:"disabled",type:"png"});
   if(i%60===0)process.stdout.write(`FRAME ${i}/${frameCount} elapsed=${Math.floor((Date.now()-start)/1000)}s\n`);
  }
  await writeFile(resolve(folder,"metadata.json"),JSON.stringify({fps:doc.format.fps,frames:frameCount,width:doc.format.w,height:doc.format.h}));
 }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
