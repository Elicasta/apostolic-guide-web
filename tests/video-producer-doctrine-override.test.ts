import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const code = (path: string) => readFileSync(path, "utf8");

test("video doctrine is derived from persisted text, graphics and edit revision", () => {
  const source = code("src/video-producer-doctrine.ts");
  assert.match(source, /videoSceneDocument.safeParse/);
  assert.match(source, /spoken_transcript/);
  assert.match(source, /edit_overlays/);
  assert.match(source, /on_screen_graphics/);
  assert.match(source, /content_revision/);
  assert.match(source, /project.edit_plan/);
  assert.match(source, /project.transcript/);
});

test("video approval reads stored matching verdict instead of auto-bypassing a flag", () => {
  const approval = code("app/api/admin/video-producer/approve/route.ts");
  assert.match(approval, /await assertDoctrineApproved/);
  assert.match(approval, /videoProducerDoctrineSource/);
  assert.doesNotMatch(approval, /evaluateDoctrine/);
});

test("only owner can override the latest matching FLAG with an audited reason", () => {
  const route = code("app/api/admin/video-producer/doctrine-check/route.ts");
  assert.match(route, /access.role !== "owner"/);
  assert.match(route, /current.state !== "flag"/);
  assert.match(route, /recordStudioAudit/);
  assert.match(route, /\.eq\("status", "flag"\)\.is\("approved_at", null\)/);
  assert.match(route, /min\(12\)/);
});

test("video review exposes doctrine results and disables approval unless passed or owner-approved", () => {
  const flow = code("src/video-producer-sequential-flow.tsx");
  const panel = code("src/video-producer-doctrine-panel.tsx");
  assert.match(flow, /<VideoProducerDoctrinePanel/);
  assert.match(flow, /!doctrineReady/);
  assert.match(panel, /status === "flag" && canOverride/);
  assert.match(panel, /status === "fail"/);
  assert.match(panel, /onChange\?\.\(false\)/);
  const editor = code("src/code-mode/video-kinetic-editor.tsx");
  assert.match(editor, /<VideoProducerDoctrinePanel/);
  assert.match(editor, /raw===savedRaw/);
  assert.match(editor, /Save your scene changes/);
  assert.match(code("app/api/admin/video-producer/approve/route.ts"), /\.eq\("updated_at", project\.data\.updated_at\)/);
});
