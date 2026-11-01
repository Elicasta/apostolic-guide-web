import test from "node:test";import assert from "node:assert/strict";import {readFileSync} from "node:fs";
import {threadsCodeSchema,emptyThreadsCode} from "../src/code-mode/threads";import {parseCodeDocument} from "../src/code-mode/core";
test("Threads JSON validates single or weekly posts, prevents duplicates and enforces 500 chars",()=>{
 const document={...emptyThreadsCode() as Record<string,unknown>,posts:[{position:1,category:"oneness",body:"The Lord our God is one Lord.",mirrorToX:false}]};
 assert.equal(threadsCodeSchema.parse(document).mode,"single");
 assert.throws(()=>threadsCodeSchema.parse({...document,posts:[{position:1,category:"oneness",body:"x".repeat(501)}]}));
 assert.throws(()=>threadsCodeSchema.parse({...document,mode:"weekly",posts:[{position:1,category:"oneness",body:"yes"},{position:1,category:"witty",body:"also yes"}]}));
 assert.throws(()=>parseCodeDocument('{\n"tool":"threads",\n"posts":,}',v=>threadsCodeSchema.parse(v)),/Line 3/);
});
test("Code Mode endpoint only writes drafts and uses the existing doctrine gate",()=>{
 const code=readFileSync("app/api/admin/threads-studio/code/route.ts","utf8");
 assert.match(code,/recordDoctrineCheck/);assert.match(code,/apply_studio_threads_code/);
 assert.doesNotMatch(code,/publishThreadsText|sendToPublishing|sendBroadcastDraft/);
 const sql=readFileSync("supabase/migrations/20261027113000_threads_code_mode.sql","utf8");
 assert.match(sql,/status='draft'/);assert.match(sql,/revoke all on function/);
});
