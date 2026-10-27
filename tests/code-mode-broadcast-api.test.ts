import test from "node:test";import assert from "node:assert/strict";import {readFileSync} from "node:fs";
test("Broadcast Code Mode Apply and Restore API contain no external send or scheduling action",()=>{
 const api=readFileSync("app/api/admin/broadcast-code/route.ts","utf8");
 assert.match(api,/code_mode\.broadcast\.applied/);assert.match(api,/expectedVersion/);assert.match(api,/studio_broadcast_code_revisions/);
 assert.doesNotMatch(api,/api\.resend\.com|sendBroadcastDraft|sendBroadcastTest|publish-now|schedulePublication/);
});
test("Broadcast test and Resend draft require current content-bound doctrine verdict",()=>{
 const api=readFileSync("app/api/admin/broadcasts/route.ts","utf8");
 assert.match(api,/approvedBroadcastCode/);assert.match(api,/contentHash/);assert.match(api,/last_created_hash/);
 assert.match(api,/access\.user\.email/);assert.match(api,/action === "send"/);
});
test("Broadcast Code Mode retains the source-only human send click",()=>{
 const ui=readFileSync("src/broadcast-editor.tsx","utf8");
 assert.match(ui,/window\.confirm/);assert.match(ui,/DoctrineCheckPanel/);assert.match(ui,/!authorized/);
});
