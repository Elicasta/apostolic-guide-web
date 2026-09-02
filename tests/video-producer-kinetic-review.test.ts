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
  assert.match(panel, /A-roll hit →/);
  for (const treatment of ["impact", "split", "strike", "band", "stack", "question-stack"]) {
    assert.match(panel, new RegExp(`id: "${treatment}"`));
  }
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
