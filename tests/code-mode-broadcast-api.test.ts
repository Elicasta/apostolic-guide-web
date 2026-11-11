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

test("Saved draft listing, restore and presets are private and never call Resend",()=>{
 const route=readFileSync("app/api/admin/broadcast-code/route.ts","utf8");
 const presets=readFileSync("app/api/admin/broadcast-code/presets/route.ts","utf8");
 const ui=readFileSync("src/broadcast-editor.tsx","utf8");
 assert.ok(route.includes('.eq("owner_id",access.user.id)'));
 assert.ok(route.includes('studio_broadcast_code_revisions'));
 assert.ok(presets.includes('getStudioPermission("manage_distribution")'));
 assert.ok(presets.includes('.eq("created_by",user.id)'));
 assert.ok(presets.includes('.eq("tool","broadcast")'));
 assert.ok(presets.includes('.upsert('));
 assert.ok(ui.includes("Undo to previous saved version"));
 assert.ok(ui.includes("Saved design presets"));
 assert.ok(ui.includes("Saved drafts"));
 assert.ok(ui.includes("loadCode(d.id)"));
 for(const source of [route,presets])assert.doesNotMatch(source,/api\.resend\.com|sendBroadcastDraft|sendBroadcastTest|resend\.broadcasts\.create/);
});
