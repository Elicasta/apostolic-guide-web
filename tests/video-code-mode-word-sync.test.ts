import test from "node:test";import assert from "node:assert/strict";
import {videoSceneStarter,videoSceneDocument} from "../src/code-mode/video-scenes";
import {alignVideoSceneWords,wordsOnOutput} from "../src/code-mode/video-word-sync";
const doc=()=>videoSceneDocument.parse({tool:"video",version:2,kind:"producer",
 id:"00000000-0000-4000-8000-000000000001",
 format:{w:1080,h:1920,fps:30},assets:[],style:{preset:"AG Editorial"},
 scenes:[{...videoSceneStarter("statement"),start:10,end:13,anchor:{phrase:"I am he"}}]});
const words=[{word:"before",start:0,end:.3},{word:"I",start:10,end:10.2},{word:"am",start:10.2,end:10.4},{word:"he",start:10.4,end:10.6}];
test("word anchored scene shifts with a cut, preserving duration",()=>{
 const aligned=alignVideoSceneWords(doc(),words,[{start:10,end:11}]);
 assert.equal(aligned.scenes[0].start,0);assert.equal(aligned.scenes[0].end,3);
 assert.equal(aligned.scenes[0].anchor?.phrase,"I am he");
});
test("fails closed when target words are removed",()=>{
 assert.throws(()=>alignVideoSceneWords(doc(),words,[{start:0,end:1}]),/Re-anchor/);
 const withIndex={...doc(),scenes:[{...doc().scenes[0],anchor:{wordIndex:1}}]};
 assert.equal(alignVideoSceneWords(videoSceneDocument.parse(withIndex),words,[{start:10,end:11}]).scenes[0].start,0);
});
test("retains original source indexes in mapped transcript",()=>{
 const mapped=wordsOnOutput(words,[{start:10,end:11}]);
 assert.deepEqual(mapped.map(x=>x.sourceIndex),[1,2,3]);
 assert.throws(()=>wordsOnOutput(words,[{start:4,end:1}]),/Invalid kept segment/);
});
