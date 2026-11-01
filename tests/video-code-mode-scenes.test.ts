import test from "node:test";
import assert from "node:assert/strict";
import {videoSceneDocument,videoSceneStarter,sceneAt,propsAt,easingAt} from "../src/code-mode/video-scenes";
const make=()=>({tool:"video" as const,version:2 as const,kind:"studio" as const,id:"god-is-one",
 format:{w:1080,h:1920,fps:30},assets:[],style:{preset:"AG Editorial"},scenes:[videoSceneStarter("scripture")]});
test("validates duration, scene IDs and keyframes",()=>{
 const good=videoSceneDocument.parse(make());
 assert.equal(good.scenes[0].end,3);
 assert.equal(sceneAt(good,3).length,0);
 assert.equal(sceneAt(good,1).length,1);
 assert.equal(videoSceneDocument.safeParse({...make(),scenes:[good.scenes[0],good.scenes[0]]}).success,false);
 assert.equal(videoSceneDocument.safeParse({...make(),scenes:[{...good.scenes[0],end:0}]}).success,false);
 assert.equal(videoSceneDocument.safeParse({...make(),scenes:[{...good.scenes[0],keyframes:[{t:10,target:"title",props:{opacity:1},ease:"ease"}]}]}).success,false);
});
test("blocks markup capable of executing scripts or retrieving external files",()=>{
 for(const html of ['<script>alert(1)</script>','<img src=x onerror=alert(1)>','<iframe src="https://x"></iframe>','<div style="background:url(https://x)">x</div>']){
  const obj=make();obj.scenes[0].html=html;
  assert.equal(videoSceneDocument.safeParse(obj).success,false,html);
 }
});
test("samples keyframes in scene-relative seconds with the same deterministic easing",()=>{
 const scene=videoSceneDocument.parse(make()).scenes[0];
 assert.equal(propsAt(scene,"title",0).opacity,0);
 assert.equal(propsAt(scene,"title",.5).opacity,1);
 assert.equal(propsAt(scene,"title",100).opacity,1);
 assert.equal(Object.keys(propsAt(scene,"not-a-target",.2)).length,0);
 assert.equal(easingAt("linear",.5),.5);
 assert.equal(easingAt("ease-in-out",.5),.5);
 assert.ok(Number.isFinite(easingAt("spring",.25)));
 assert.ok(Number.isFinite(easingAt("cubic-bezier(0.4,0,0.2,1)",.25)));
});
