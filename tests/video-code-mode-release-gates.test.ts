import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {videoCheckpointTableMissing} from "../src/code-mode/video-checkpoints";

test("only absent video checkpoint table is recoverable",()=>{
  assert.equal(videoCheckpointTableMissing({code:"PGRST205",message:"Could not find the table 'studio_code_mode_checkpoints' in the schema cache"}),true);
  assert.equal(videoCheckpointTableMissing({code:"42P01",message:"relation does not exist"}),true);
  assert.equal(videoCheckpointTableMissing({code:"42501",message:"Permission denied"}),false);
  assert.equal(videoCheckpointTableMissing({code:"PGRST301",message:"JWT expired"}),false);
  assert.equal(videoCheckpointTableMissing(null),false);
});
test("Studio render snapshots resolved graphics but does not persist their temporary URLs in project style",()=>{
  const route=readFileSync("app/api/admin/video-studio/render/route.ts","utf8");
  assert.match(route,/renderStyle=\{\.\.\.style,kineticSceneV2:await resolveVideoGraphicAssets\(/);
  assert.match(route,/style: renderStyle,\s*assetId:/);
  assert.doesNotMatch(route,/style: projectResult\.data\.style,\s*assetId:/);
});
test("Producer V2 composes kinetic scenes BEFORE bumper package and retains final post-mix audio normalization",()=>{
  const worker=readFileSync("scripts/render_video_producer_finishing_worker.py","utf8");
  const motion=worker.indexOf("kinetic_document = manifest.get");
  const packageBegin=worker.indexOf("bw.package_with_bumpers");
  const normalize=worker.indexOf("master_packaged_audio(sys.argv[2]");
  assert.ok(motion>0&&packageBegin>motion&&normalize>packageBegin,"kinetic -> package -> postmix mastering");
  assert.match(worker,/amix=inputs=2:duration=first:dropout_transition=0:normalize=0/);
  assert.doesNotMatch(worker,/alimiter=limit=0\.94,loudnorm=/);
});
test("checkpoint-dependent Video Code Mode does not hard-fail on optional history-table absence",()=>{
  const route=readFileSync("app/api/admin/code-mode/video-v2/route.ts","utf8");
  assert.match(route,/videoCheckpointTableMissing\(previous\.error\)/);
  assert.match(route,/videoCheckpointTableMissing\(checkpoint\.error\)/);
  assert.match(route,/historyAvailable/);
});
