import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { videoProducerProductionFingerprintInput } from "../src/video-producer-multicam";

test("Video Producer Review exposes exact kinetic phrase, treatment, and timing controls", () => {
  const panel = readFileSync("src/video-producer-kinetic-review.tsx", "utf8");
  const page = readFileSync("app/admin/video-producer/[projectId]/[step]/page.tsx", "utf8");
  assert.match(page, /VideoProducerKineticReview/);
  assert.match(page, /step === "review"/);
  assert.match(panel, /Primary phrase/);
  assert.match(panel, /Secondary line/);
  assert.match(panel, /Treatment/);
  assert.match(panel, /Start · sec/);
  assert.match(panel, /Duration · sec/);
  assert.match(panel, /A-roll phrase → moving field/);
  for (const treatment of ["impact", "split", "band", "stack", "question-stack"]) {
    assert.match(panel, new RegExp(`id: "${treatment}"`));
  }
  assert.match(panel, /normalizeReviewCue/);
  assert.match(panel, /cue\.treatment === "strike" \? \{ \.\.\.cue, treatment: "impact" \}/);
});

test("source page exposes Camera B and External Audio before the long source workspace", () => {
  const page = readFileSync("app/admin/video-producer/[projectId]/[step]/page.tsx", "utf8");
  const sourceMedia = page.indexOf('step === "source" ? <VideoProducerMulticamPanel');
  const flow = page.indexOf("<VideoProducerSequentialFlow");
  assert.ok(sourceMedia >= 0, "source synchronized-media panel is mounted");
  assert.ok(flow >= 0, "sequential project flow is mounted");
  assert.ok(sourceMedia < flow, "source synchronized-media controls appear before the long Source workspace");
});

test("kinetic preview communicates field-based Motion 02 and removes strike/scribble choices", () => {
  const panel = readFileSync("src/video-producer-kinetic-review.tsx", "utf8");
  const css = readFileSync("src/video-producer-kinetic-review.module.css", "utf8");
  assert.match(panel, /KINETIC GRAPHICS \/ 02/);
  assert.match(panel, /field wipes, split frames, oversized type and staggered support/);
  assert.match(panel, /Crimson headline \+ staggered paper support/);
  assert.doesNotMatch(panel, /id: "strike", label:/);
  assert.match(css, /\.preview\[data-treatment="stack"\] b \{/);
  assert.doesNotMatch(css, /rotate\(/);
});

test("manual kinetic changes invalidate old production approval", () => {
  const route = readFileSync("app/api/admin/video-producer/kinetic/route.ts", "utf8");
  assert.match(route, /approval_fingerprint: null/);
  assert.match(route, /approved_at: null/);
  assert.match(route, /status === "approved" \? \{ status: "planned" \}/);
});

test("kinetic treatment is part of the normal edit-plan production fingerprint input", () => {
  const planA = { version: 2, overlays: [{ id: "k1", kind: "kinetic", treatment: "impact", title: "ONE GOD" }] };
  const planB = { version: 2, overlays: [{ id: "k1", kind: "kinetic", treatment: "split", title: "ONE GOD" }] };
  assert.deepEqual(videoProducerProductionFingerprintInput({ contentPlan: planA }), planA);
  assert.deepEqual(videoProducerProductionFingerprintInput({ contentPlan: planB }), planB);
  assert.notDeepEqual(planA, planB);
});
