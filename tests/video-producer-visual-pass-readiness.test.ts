import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("long-form Video Producer cannot approve with a skipped or zero-B-roll Visual Pass", () => {
  const readiness = readFileSync("src/video-producer-visual-pass-server.ts", "utf8");
  const approve = readFileSync("app/api/admin/video-producer/approve/route.ts", "utf8");
  const render = readFileSync("app/api/admin/video-producer/render/route.ts", "utf8");

  assert.match(readiness, /LONG_FORM_BROLL_FLOOR_SECONDS = 120/);
  assert.match(readiness, /missingRequiredBroll/);
  assert.match(readiness, /Visual Pass returned zero B-roll for a long-form episode/);
  assert.match(readiness, /Select footage, generate an insert, or explicitly stay on A-roll/);
  assert.match(approve, /requireVideoProducerVisualPassReady/);
  assert.match(render, /requireVideoProducerVisualPassReady/);
});

test("Finish auto-runs Visual Pass and searches real footage before generation", () => {
  const panel = readFileSync("src/video-producer-visual-pass-panel.tsx", "utf8");
  const visualRoute = readFileSync("app/api/admin/video-producer/visual-pass/route.ts", "utf8");

  assert.match(panel, /autoPassRef/);
  assert.match(panel, /void prepareEpisode\(state\)/);
  assert.match(panel, /AUTO_MIN_SCORE = 84/);
  assert.match(panel, /AG LIBRARY · FIRST/);
  assert.match(panel, /RUNWAY · AI FALLBACK/);
  assert.match(panel, /visual-pass\/search/);
  assert.match(panel, /visual-pass\/use/);
  assert.match(visualRoute, /normally return about 5-9 genuine B-ROLL beats/);
  assert.match(visualRoute, /Do not return zero B-roll merely because graphics already exist/);
});

test("Review and Deliver redirect to Finish until Visual Pass readiness is true", () => {
  const page = readFileSync("app/admin/video-producer/[projectId]/[step]/page.tsx", "utf8");
  assert.match(page, /resolveVideoProducerVisualPassReadiness/);
  assert.match(page, /if \(!visualPass\.ready\) redirect\(`\/admin\/video-producer\/\$\{projectId\}\/finish`\)/);
});
