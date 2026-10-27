import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {autoTranscribeDue,nextAutoRetryAt,readAutoTranscribe,AUTO_TRANSCRIBE_MAX_ATTEMPTS} from "../src/video-producer-upload-queue";

test("only explicitly queued uploads become due; existing historical projects remain untouched",()=>{
 const now=new Date("2026-10-27T22:00:00.000Z");
 assert.equal(autoTranscribeDue(null,now),false);
 assert.equal(autoTranscribeDue({},now),false);
 assert.equal(autoTranscribeDue({autoTranscribe:{enabled:true,attempts:0}},now),true);
 assert.equal(autoTranscribeDue({autoTranscribe:{enabled:true,attempts:2,nextAttemptAt:"2026-10-27T22:01:00.000Z"}},now),false);
 assert.equal(autoTranscribeDue({autoTranscribe:{enabled:true,attempts:3}},now),false);
 assert.equal(autoTranscribeDue({autoTranscribe:{enabled:false,attempts:0}},now),false);
 assert.equal(AUTO_TRANSCRIBE_MAX_ATTEMPTS,3);
});
test("dispatch retries are spaced and bounded",()=>{
 const date=new Date("2026-10-27T22:00:00.000Z");
 assert.equal(nextAutoRetryAt(1,date),"2026-10-27T22:01:00.000Z");
 assert.equal(nextAutoRetryAt(2,date),"2026-10-27T22:02:00.000Z");
 assert.equal(nextAutoRetryAt(3,date),"2026-10-27T22:05:00.000Z");
 assert.deepEqual(readAutoTranscribe({autoTranscribe:{enabled:true,attempts:2}}),{
  enabled:true,attempts:2,nextAttemptAt:null
 });
});
test("upload callback creates durable queue and starter atomically guards status and source",()=>{
 const upload=readFileSync("app/api/admin/video-producer/upload/route.ts","utf8");
 const starter=readFileSync("src/video-producer-transcription-start.ts","utf8");
 const cron=readFileSync("app/api/cron/video-producer-transcription/route.ts","utf8");
 assert.match(upload,/onUploadCompleted/);
 const begin=upload.indexOf("onBeforeGenerateToken:");
 const done=upload.indexOf("onUploadCompleted:");
 assert.ok(begin>=0 && done>begin,"has an authenticated upload start and completion");
 const uploadPreparation=upload.slice(begin,done);
 assert.match(uploadPreparation,/transcript_text:\s*null/,"reuploads clear prior transcript");
 assert.match(uploadPreparation,/transcript:\s*\{\s*words:\s*\[\],\s*segments:\s*\[\]\s*\}/);
 assert.ok(starter.indexOf('const claimed=')<starter.indexOf('await videoProducerRendererCredentials(service)'),
  "claims must precede external credential access, so failures receive backoff");
 assert.match(upload,/autoTranscribe:\s*\{\s*enabled:\s*true/);
 assert.match(upload,/startVideoProducerTranscription/);
 assert.match(starter,/\.eq\("source_locator",project\.source_locator\)/);
 assert.match(starter,/\.in\("status",\["uploaded","failed"\]\)\.is\("transcript_text",null\)/);
 assert.match(starter,/callbackTokenHash:callback\.hash/);
 assert.match(starter,/\.contains\("director_metadata",\{transcriptionBridge:\{callbackTokenHash:callback\.hash\}\}\)/);
 assert.match(cron,/cronRequestAuthorized/);
 assert.match(cron,/autoTranscribeDue/);
 assert.match(cron,/\.limit\(40\)/);
});
