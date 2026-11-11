import test from "node:test";
import assert from "node:assert/strict";
import {ACTION_SCOPE,canAgentPerform,isVideoProducerAgentEditable,videoAgentTokenRequestSchema} from "../src/video-producer-agent-policy";

test("scoped draft agents cannot approve, schedule or publish",()=>{
 const scopes=Object.values(ACTION_SCOPE);
 assert.equal(scopes.some(s=>/approve|schedule|publish/.test(s)),false);
 for(const action of ["approve","publish","schedule","sendToPublisher","delete"]){
  assert.equal(canAgentPerform({scope:"draft:projects",action,status:"draft"}),false);
 }
 assert.equal(canAgentPerform({scope:"draft:timeline",action:"applyTimeline",status:"planned"}),true);
 assert.equal(canAgentPerform({scope:"draft:timeline",action:"applyTimeline",status:"approved"}),false);
 assert.equal(canAgentPerform({scope:"draft:preview",action:"requestPreview",status:"rendering"}),false);
 assert.equal(canAgentPerform({scope:"draft:assets",action:"authorizeAsset",status:"draft",approved:true}),false);
});
test("agent token scope and lifetime parsing is limited",()=>{
 assert.equal(videoAgentTokenRequestSchema.safeParse({label:"Editor",scopes:["draft:read"],expiresInDays:7}).success,true);
 assert.equal(videoAgentTokenRequestSchema.safeParse({label:"Editor",scopes:["approve"],expiresInDays:7}).success,false);
 assert.equal(videoAgentTokenRequestSchema.safeParse({label:"Editor",scopes:["draft:read","draft:read"],expiresInDays:7}).success,false);
 assert.equal(videoAgentTokenRequestSchema.safeParse({label:"Editor",scopes:["draft:read"],expiresInDays:31}).success,false);
 assert.equal(isVideoProducerAgentEditable({status:"approved",approval_fingerprint:null}),false);
 assert.equal(isVideoProducerAgentEditable({status:"draft",approval_fingerprint:"old"}),false);
});
