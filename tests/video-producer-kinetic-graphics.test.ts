import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { compileVideoProducerRenderPlan } from "../src/video-producer";
import { normalizeVideoProducerDirectorOutput } from "../src/video-producer-ai";

function directorPayload(treatment: "impact" | "split" | "strike" | "band" | "stack" | "question-stack" = "split") {
  return {
    summary: "Kinetic graphics smoke",
    cuts: [],
    overlays: [{
      kind: "kinetic",
      start: 2,
      duration: 4,
      title: "ONE GOD",
      body: "REVEALED IN JESUS",
      reference: null,
      animation: "pop",
      placement: "center",
      treatment
    }],
    motion: []
  };
}

test("Video Producer preserves a semantic kinetic treatment and forces it full-frame", () => {
  const { plan } = normalizeVideoProducerDirectorOutput(directorPayload("split"), "podcast", 20);
  assert.equal(plan.overlays.length, 1);
  const cue = plan.overlays[0];
  assert.equal(cue.kind, "kinetic");
  assert.equal(cue.treatment, "split");
  assert.equal(cue.placement, "full-frame");
  assert.equal(cue.title, "ONE GOD");
  assert.equal(cue.body, "REVEALED IN JESUS");

  const render = compileVideoProducerRenderPlan(plan);
  assert.deepEqual(render.overlays[0].outputRanges, [{ sourceStart: 2, sourceEnd: 6, outputStart: 2, outputEnd: 6 }]);
});

test("all approved kinetic treatment names normalize without falling back to generic cards", () => {
  for (const treatment of ["impact", "split", "strike", "band", "stack", "question-stack"] as const) {
    const { plan } = normalizeVideoProducerDirectorOutput(directorPayload(treatment), "podcast", 20);
    assert.equal(plan.overlays[0].treatment, treatment);
    assert.equal(plan.overlays[0].kind, "kinetic");
  }
});

test("AG kinetic renderer owns the requested deep-red bone black visual language", () => {
  const renderer = readFileSync("scripts/video_producer_kinetic_graphics.py", "utf8");
  assert.match(renderer, /AG_RED = "2D21B3"/);
  assert.match(renderer, /AG_BONE = "F2F9FF"/);
  assert.match(renderer, /AG_BLACK = "111111"/);
  assert.match(renderer, /text hit over A-roll/);
  assert.match(renderer, /moving_rect/);
  assert.match(renderer, /render_strike/);
  assert.match(renderer, /render_question_stack/);
});

test("Edit Director reserves kinetic graphics for faithful spoken phrases instead of decorative captions", () => {
  const route = readFileSync("app/api/admin/video-producer/direct/route.ts", "utf8");
  assert.match(route, /KINETIC COPY MUST stay faithful to words actually spoken/);
  assert.match(route, /impact = huge phrase over the speaker/);
  assert.match(route, /deep AG red, warm bone\/off-white, black\/near-black/);
  assert.match(route, /kind: "kinetic"/);
  assert.match(route, /treatment: "impact"/);
});
