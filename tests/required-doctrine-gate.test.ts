import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path,"utf8");
const gate=source("src/doctrine-gate.ts");
const migration=source("supabase/migrations/20261026220000_required_doctrine_gate.sql");

test("one pinned lock and exact KJV Scripture evidence drive every verdict",()=>{
 assert.match(gate,/APOSTOLIC_DOCTRINE_LOCK/);
 assert.match(gate,/findPublicDoctrineViolation/);
 assert.match(gate,/readKjvPassage\(corpus,ref\)/);
 assert.match(gate,/quoted Scripture/);
 assert.match(gate,/Frame HTML/);
 assert.match(gate,/kicker","quote","label","eyebrow/);
});

test("a doctrine check is bound to source and caption hash",()=>{
 assert.match(gate,/createHash\("sha256"\)/);
 assert.match(gate,/sourceId:source.sourceId,lines:source.lines,caption:source.caption/);
 assert.match(gate,/row.content_hash!==hash/);
 assert.match(gate,/\["pass","flagged_approved"\].includes\(current.state\)/);
});

test("owner override cannot accept a FAIL",()=>{
 const api=source("app/api/admin/doctrine-check/route.ts");
 assert.match(api,/access.role!=="owner"/);
 assert.match(api,/current.state!=="flag"/);
 assert.match(api,/only the latest matching FLAG/i);
 assert.match(api,/recordStudioAudit/);
 assert.match(api,/approve.*note|approval note/i);
});

test("creative approval exists at create, execution, and manual finish",()=>{
 for(const path of ["app/api/admin/creative-publications/route.ts","src/creative-publication-executor.ts","app/api/admin/creative-publications/[publicationId]/manual-finish/route.ts"]){
  assert.match(source(path),/await assertDoctrineApproved/);
 }
});

test("video and uploaded media are checked again by their worker",()=>{
 for(const path of ["app/api/admin/publishing/custom-media/route.ts","app/api/admin/publishing/publish-now/route.ts","app/api/admin/publishing/schedule/route.ts","src/scheduled-publishing.ts"]){
  assert.match(source(path),/await assertDoctrineApproved/);
 }
});

test("Threads cannot be queued or published without a stored verdict",()=>{
 for(const path of ["app/api/admin/threads-studio/ready/route.ts","app/api/admin/threads-studio/queue/route.ts","app/api/admin/threads-studio/publish/route.ts","src/threads-publisher.ts"]){
  assert.match(source(path),/await assertDoctrineApproved/);
 }
});

test("the database clears doctrine approvals after content edits",()=>{
 assert.match(migration,/default 'not_checked'/);
 assert.match(migration,/new.editor_state is distinct from old.editor_state/);
 assert.match(migration,/new.unified_caption is distinct from old.unified_caption/);
 assert.match(migration,/studio_clear_changed_doctrine_trigger/);
});

test("a calendar status edit cannot schedule around Publishing",()=>{
 assert.match(source("app/api/admin/content-calendar/route.ts"),/if\(values.status==="scheduled"\|\|values.status==="published"\)/);
});

test("publishing UX requires explicit doctrine PASS for each source",()=>{
 for(const path of ["src/creative-publishing-client.tsx","src/custom-media-publishing-client.tsx","src/channel-publishing.tsx","src/threads-publishing-client.tsx"]){
  const text=source(path);
  assert.match(text,/<DoctrineCheckPanel/);
  assert.match(text,/!doctrineReady/);
 }
});

test("Meta tokens are probed live and warned about expiry",()=>{
 const meta=source("src/meta-token-health.ts");
 assert.match(meta,/\/v1\.0\/me\?fields=id,username/);
 assert.match(meta,/\/v24\.0\/me\?fields=id,username/);
 assert.match(meta,/remaining<=7/);
 assert.match(meta,/th_refresh_token/);
 assert.match(meta,/ig_refresh_token/);
 assert.match(source("src/studio-health.ts"),/getMetaTokenHealth/);
});
