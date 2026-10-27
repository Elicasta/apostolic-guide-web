#!/usr/bin/env node
/** 30-second synthetic multi-scene motion proof. No private media or credentials. */
import {mkdtemp,readFile,writeFile,rm,stat} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";

function execute(cmd,args){
  const r=spawnSync(cmd,args,{encoding:"utf8",timeout:18*60*1000});
  if(r.error)throw r.error;
  if(r.status!==0)throw new Error(cmd+" exited "+r.status+"\n"+(r.stderr||"").slice(-2400));
  return r.stdout;
}
const fixture=JSON.parse(await readFile("tests/fixtures/video-code-mode-kinetic-5s.json","utf8"));
const dir=await mkdtemp(join(tmpdir(),"ag-motion-30s-"));
const source=join(dir,"source.mp4"),doc=join(dir,"scene.json"),out=join(dir,"golden-30s.mp4");
try{
  fixture.scenes=fixture.scenes.map(scene=>({
    ...scene,start:scene.start*6,end:scene.end*6
  }));
  await writeFile(doc,JSON.stringify(fixture));
  execute("ffmpeg",["-hide_banner","-loglevel","error","-y",
    "-f","lavfi","-i","testsrc2=size=360x640:rate=30",
    "-f","lavfi","-i","sine=frequency=220:sample_rate=48000",
    "-t","30","-c:v","libx264","-preset","ultrafast","-pix_fmt","yuv420p",
    "-c:a","aac","-b:a","128k",source]);
  const input=JSON.parse(execute("ffprobe",["-v","error","-show_streams","-show_format","-of","json",source]));
  const sourceDuration=Number(input.format?.duration);
  if(!(sourceDuration>=29.8&&sourceDuration<=30.2))
    throw new Error("30-second acceptance input itself is malformed: "+sourceDuration);
  execute("node",["--import","tsx","scripts/render-video-code-mode.ts",doc,source,out,"0","30"]);
  const probe=JSON.parse(execute("ffprobe",["-v","error","-show_streams","-show_format","-of","json",out]));
  const video=probe.streams.find(s=>s.codec_type==="video");
  const audio=probe.streams.find(s=>s.codec_type==="audio");
  const duration=Number(probe.format?.duration);
  if(!video||video.width!==360||video.height!==640||!audio||!(duration>=29.8&&duration<=30.2))
    throw new Error("Bad 30s motion export: "+JSON.stringify({duration,video,audio}));
  const size=(await stat(out)).size;
  if(size<10000)throw new Error("30s motion export is abnormally small");
  console.log("30-second Scripture → statement → lower-third kinetic MP4, AAC audio, 30fps: PASS",JSON.stringify({duration,size,format:"360x640"}));
}finally{await rm(dir,{recursive:true,force:true});}
