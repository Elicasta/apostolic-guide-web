import test from "node:test";import assert from "node:assert/strict";
import { isTrustedLiveStudioOrigin,isValidHandoffId,MAX_LIVE_IMPORT_BYTES } from "../src/video-producer-live-handoff";
test("only the genuine HTTPS Live Studio app can transfer recordings",()=>{
 assert.equal(isTrustedLiveStudioOrigin("https://apostolic-guide-live-hjs5npsc3-elicastas-projects.vercel.app"),true);
 assert.equal(isTrustedLiveStudioOrigin("https://live.apostolicguide.com"),true);
 assert.equal(isTrustedLiveStudioOrigin("https://attacker.example"),false);
 assert.equal(isTrustedLiveStudioOrigin("https://apostolic-guide-live.attacker.com"),false);
 assert.equal(isTrustedLiveStudioOrigin("http://live.apostolicguide.com"),false);
});
test("handoff ids must be UUID shaped and transfer size is bounded",()=>{
 assert.equal(isValidHandoffId("c8f21413-ff48-4db5-84da-d3e570ee043e"),true);
 assert.equal(isValidHandoffId("a-secret-nope"),false);
 assert.equal(MAX_LIVE_IMPORT_BYTES,512*1024*1024);
});
