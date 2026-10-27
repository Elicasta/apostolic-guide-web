import assert from "node:assert/strict";
import {test} from "node:test";
import {initialVideoV2,insertVideoTemplate,resolveVideoSceneAnchors,videoCodeV2Schema,videoFrameHtml,VIDEO_SCENE_TEMPLATES} from "../src/code-mode/video-v2";
import {wholeItemSchema} from "../src/code-mode/whole-item";

function sample() {
 const doc=initialVideoV2("producer","e49347f5-e4de-4701-9416-c8797ff0a1b4");
 return insertVideoTemplate(doc,VIDEO_SCENE_TEMPLATES[0],2);
}
test("v2 is parsed by the shared Code Mode envelope; v1 tools stay valid",()=>{
 const value=wholeItemSchema.parse(sample());
 assert.equal(value.version,2);
 const legacy=wholeItemSchema.parse({tool:"video",version:1,kind:"studio",id:"god-is-one",timeline:[{id:"1",start:1,kind:"scripture",eyebrow:"",title:"One",body:"",reference:"Deut 6:4"}],style:{}});
 assert.equal(legacy.version,1);
});
test("required scene end, unique scene IDs and bounded keyframes",()=>{
 const doc=sample();
 assert.equal(doc.scenes[0].end,5);
 assert.ok(!videoCodeV2Schema.safeParse({...doc,scenes:[doc.scenes[0],doc.scenes[0]]}).success);
 assert.ok(!videoCodeV2Schema.safeParse({...doc,scenes:[{...doc.scenes[0],end:2}]}).success);
 assert.ok(!videoCodeV2Schema.safeParse({...doc,scenes:[{...doc.scenes[0],keyframes:[{t:20,target:".headline",props:{x:100}}]}]}).success);
 assert.ok(!videoCodeV2Schema.safeParse({...doc,scenes:[{...doc.scenes[0],css:".x{background:url(https://evil.example/x)}"}]}).success);
 assert.ok(!videoCodeV2Schema.safeParse({...doc,scenes:[{...doc.scenes[0],keyframes:[{t:1,target:"body{color:red}",props:{x:0}}]}]}).success);
});
test("frame compiler uses deterministic times and strips active script content",()=>{
 const doc=sample();doc.scenes[0].html+='<script>alert(1)</script><img src="https://evil.example/x">';
 const start=videoFrameHtml(doc,1.99),during=videoFrameHtml(doc,2.3),after=videoFrameHtml(doc,5.01);
 assert.ok(!start.includes('class="ag-scene ag-scene-scripture'));
 assert.ok(during.includes("Deuteronomy 6:4"));
 assert.ok(!during.includes("<script"));
 assert.ok(!during.includes("<img"));
 assert.ok(!after.includes('class="ag-scene ag-scene-scripture'));
 assert.equal(during,videoFrameHtml(doc,2.3));
});
test("word and phrase anchors follow cut map and disappear on deleted words",()=>{
 const doc=sample();
 doc.scenes[0].anchor={phrase:"God is one"};
 const words=[{word:"God",start:3,end:3.2},{word:"is",start:3.2,end:3.4},{word:"one",start:3.4,end:3.7}];
 const mapped=resolveVideoSceneAnchors(doc,words,t=>t-1);
 assert.equal(mapped.scenes[0].start,2);
 assert.equal(mapped.scenes[0].end,5);
 assert.equal(resolveVideoSceneAnchors(doc,words,()=>null).scenes.length,0);
});
test("word kinetic captions update at precise timestamps",()=>{
 const doc=sample();doc.style.kineticCaptions=true;
 const words=[{word:"HEAR",start:2,end:2.25},{word:"ISRAEL",start:2.25,end:2.8}];
 const before=videoFrameHtml(doc,2.1,false,words);
 const next=videoFrameHtml(doc,2.35,false,words);
 assert.ok(before.includes('class="ag-captions"'));
 assert.ok(before.includes("HEAR"));
 assert.notEqual(before,next);
});
test("template library covers the eight requested types without collisions",()=>{
 let doc=initialVideoV2("studio","god-is-one");
 for(const template of VIDEO_SCENE_TEMPLATES) doc=insertVideoTemplate(doc,template);
 assert.equal(doc.scenes.length,8);
 doc=insertVideoTemplate(doc,VIDEO_SCENE_TEMPLATES[0]);
 assert.equal(doc.scenes[8].id,"scripture-2");
 assert.ok(videoCodeV2Schema.safeParse(doc).success);
});
