import test from "node:test";
import assert from "node:assert/strict";
import {
  buildKeepSegments,
  compileVideoProducerRenderPlan,
  normalizeVideoProducerCuts,
  outputDurationForPlan,
  sourceTimeToOutputTime,
  type VideoProducerEditPlan
} from "../src/video-producer";

test("normalizes, clamps and merges overlapping cuts", () => {
  assert.deepEqual(normalizeVideoProducerCuts([
    { id: "a", start: -5, end: 4 },
    { id: "b", start: 3, end: 8 },
    { id: "c", start: 40, end: 80 },
    { id: "bad", start: 20, end: 20 }
  ], 60).map(({ start, end }) => ({ start, end })), [
    { start: 0, end: 8 },
    { start: 40, end: 60 }
  ]);
});

test("builds keep segments around cuts", () => {
  assert.deepEqual(buildKeepSegments([
    { id: "a", start: 5, end: 10 },
    { id: "b", start: 20, end: 25 }
  ], 30), [
    { start: 0, end: 5 },
    { start: 10, end: 20 },
    { start: 25, end: 30 }
  ]);
});

test("calculates edited duration", () => {
  assert.equal(outputDurationForPlan({ sourceDuration: 100, cuts: [
    { id: "a", start: 10, end: 20 },
    { id: "b", start: 50, end: 65 }
  ] }), 75);
});

test("maps source timestamps into edited output and rejects removed time", () => {
  const cuts = [{ id: "a", start: 10, end: 20 }, { id: "b", start: 50, end: 60 }];
  assert.equal(sourceTimeToOutputTime(5, cuts, 100), 5);
  assert.equal(sourceTimeToOutputTime(15, cuts, 100), null);
  assert.equal(sourceTimeToOutputTime(25, cuts, 100), 15);
  assert.equal(sourceTimeToOutputTime(70, cuts, 100), 50);
});

test("compiles a deterministic worker handoff", () => {
  const plan: VideoProducerEditPlan = {
    version: 1,
    sourceDuration: 60,
    cuts: [{ id: "cut", start: 10, end: 20 }],
    overlays: [{ id: "verse", kind: "scripture", start: 30, duration: 7, title: "John 14:9" }],
    music: [],
    audioPreset: "ag-voice-clean",
    colorPreset: "ag-studio",
    intro: true,
    outro: true
  };
  const render = compileVideoProducerRenderPlan(plan);
  assert.equal(render.outputDuration, 50);
  assert.equal(render.overlays[0]?.outputStart, 20);
  assert.deepEqual(render.output, { format: "mp4", width: 1920, height: 1080, fps: 30 });
});
