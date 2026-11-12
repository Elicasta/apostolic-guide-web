import test from "node:test";
import assert from "node:assert/strict";
import {sliceVideoProducerTranscript,normalizeVideoProducerTranscript} from "../src/video-producer-ai";

test("mini episode thumbnail word timestamps are local to the shared original recording",()=>{
 const transcript=normalizeVideoProducerTranscript({
  text:"First question. Second answer.",duration:200,
  words:[{word:"First",start:20,end:21},{word:"question.",start:21,end:22},
   {word:"Second",start:120,end:121},{word:"answer.",start:121,end:123}],
  segments:[{text:"First question.",start:20,end:22},{text:"Second answer.",start:120,end:123}]
 });
 const local=sliceVideoProducerTranscript(transcript,110,150);
 assert.equal(local.duration,40);
 assert.equal(local.words[0].word,"Second");
 assert.equal(local.words[0].start,10);
 assert.equal(local.words[1].end,13);
 assert.equal(110+local.words[0].start,120); // The worker adds offset exactly once.
});
