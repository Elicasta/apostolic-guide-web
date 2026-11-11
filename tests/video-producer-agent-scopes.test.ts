import test from "node:test";
import assert from "node:assert/strict";
import {isVideoProducerDraftScope,safeVideoProducerAgentToken,hashVideoProducerAgentToken,VIDEO_PRODUCER_AGENT_DRAFT_SCOPES} from "../src/video-producer-agent-auth";
test("agent grants only five draft scopes, never approval or scheduling",()=>{
 assert.equal(VIDEO_PRODUCER_AGENT_DRAFT_SCOPES.length,5);
 for(const s of VIDEO_PRODUCER_AGENT_DRAFT_SCOPES)assert.equal(isVideoProducerDraftScope(s),true);
 for(const s of ["approve","publish","schedule","manage_distribution","token:create"])assert.equal(isVideoProducerDraftScope(s),false);
});
test("secret has a strict bearer shape and is stored only as a SHA256 digest",()=>{
 const token="vpa_"+"9".repeat(64);
 assert.equal(safeVideoProducerAgentToken("Bearer "+token),token);
 assert.equal(safeVideoProducerAgentToken("Bearer other"),null);
 assert.match(hashVideoProducerAgentToken(token),/^[a-f0-9]{64}$/);
 assert.equal(hashVideoProducerAgentToken(token).includes(token),false);
});
