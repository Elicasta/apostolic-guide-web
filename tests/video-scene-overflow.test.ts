import test from "node:test";
import assert from "node:assert/strict";
import {videoTextBoundsOverflow} from "../src/code-mode/video-scene-overflow";
const safe={left:40,top:20,right:1240,bottom:680};
test("optical measurements tolerate tiny glyph overshoots",()=>{
 assert.equal(videoTextBoundsOverflow({left:38,top:19,right:1242,bottom:683},safe),false);
 assert.equal(videoTextBoundsOverflow({left:39,top:18,right:1241,bottom:679},safe),false);
});
test("text beyond left, right, top or bottom is detected",()=>{
 for(const bad of [
  {left:32,top:30,right:500,bottom:100},
  {left:100,top:30,right:1249,bottom:100},
  {left:100,top:12,right:500,bottom:100},
  {left:100,top:30,right:500,bottom:689},
 ]){
  assert.equal(videoTextBoundsOverflow(bad,safe),true);
 }
});
test("different frame dimensions use the supplied pixel bounds",()=>{
 const portrait={left:0,top:0,right:1080,bottom:1920};
 assert.equal(videoTextBoundsOverflow({left:54,top:120,right:1025,bottom:1730},portrait),false);
 assert.equal(videoTextBoundsOverflow({left:50,top:125,right:1100,bottom:1750},portrait),true);
});
