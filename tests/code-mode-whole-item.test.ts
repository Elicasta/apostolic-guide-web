import test from "node:test";import assert from "node:assert/strict";import {readFileSync} from "node:fs";
import {wholeItemSchema} from "../src/code-mode/whole-item";import {parseCodeDocument} from "../src/code-mode/core";
test("every requested draft tool has its own strict versioned JSON schema",()=>{
 for(const tool of ["website","content_engine","episode","audio","teleprompter","video"]){
  assert.match(readFileSync("src/code-mode/whole-item.ts","utf8"),new RegExp('literal\\("'+tool+'"\\)'));
 }
 const website={tool:"website",version:1,kind:"article",title:"Jesus Christ",slug:"jesus-christ",summary:"A study of who Jesus is.",body:"The Scriptures testify that Jesus Christ is Lord."};
 assert.equal(wholeItemSchema.parse(website).tool,"website");
 assert.throws(()=>wholeItemSchema.parse({...website,publishWebsite:true}));
 assert.throws(()=>parseCodeDocument('{\n"tool":"website",\n"version":1,}',v=>wholeItemSchema.parse(v)),/Line 3/);
});
test("multi-tool Code Mode route has no publication or render side effects",()=>{
 const api=readFileSync("app/api/admin/code-mode/route.ts","utf8");
 assert.doesNotMatch(api,/sendBroadcastDraft|publishThreadsText|createBroadcastDraft|publishWebsite:true|renderVideo/);
 assert.match(api,/recordStudioAudit/);assert.match(api,/status","draft"/);
 const migration=readFileSync("supabase/migrations/20261027120000_multi_tool_code_mode.sql","utf8");
 assert.match(migration,/enable row level security/g);assert.match(migration,/p_expected_version/);
});
