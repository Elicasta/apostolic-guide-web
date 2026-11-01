import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDefaultVideoProducerPlan,
  buildKeepSegments,
  compileVideoProducerRenderPlan,
  findVideoProducerScriptureReference,
  mapSourceRangeToOutputRanges,
  normalizeVideoProducerCuts,
  outputDurationForPlan,
  sanitizeVideoProducerTransform,
  sourceTimeToOutputTime,
  type VideoProducerEditPlan
} from "../src/video-producer";
import {
  normalizeVideoProducerDirectorOutput,
  normalizeVideoProducerReelCandidates,
  normalizeVideoProducerTranscript,
  sliceVideoProducerTranscript
} from "../src/video-producer-ai";

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

test("rejects invalid duration and timestamps instead of emitting NaN", () => {
  assert.deepEqual(normalizeVideoProducerCuts([{ id: "bad", start: Number.NaN, end: Number.POSITIVE_INFINITY }], 60), []);
  assert.deepEqual(buildKeepSegments([], Number.NaN), []);
  assert.equal(sourceTimeToOutputTime(Number.NaN, [], 60), null);
  assert.equal(sourceTimeToOutputTime(10, [], Number.NaN), null);
});

test("detects standard and numbered Scripture references without false numbering", () => {
  assert.equal(findVideoProducerScriptureReference("Jesus says in John 14:9 that seeing Him reveals the Father."), "John 14:9");
  assert.equal(findVideoProducerScriptureReference("Read 1 John 4:2 before the next point."), "1 John 4:2");
  assert.equal(findVideoProducerScriptureReference("Paul writes in 2 Corinthians 5:19-20."), "2 Corinthians 5:19-20");
  assert.equal(findVideoProducerScriptureReference("Song of Solomon 2:1 is referenced here."), "Song of Solomon 2:1");
  assert.equal(findVideoProducerScriptureReference("There is no such book as 3 Corinthians 1:1."), null);
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

test("splits a timed range safely when a cut happens inside it", () => {
  assert.deepEqual(mapSourceRangeToOutputRanges(8, 22, [{ id: "cut", start: 10, end: 20 }], 30), [
    { sourceStart: 8, sourceEnd: 10, outputStart: 8, outputEnd: 10 },
    { sourceStart: 20, sourceEnd: 22, outputStart: 10, outputEnd: 12 }
  ]);
});

test("sanitizes model-proposed focal points and zoom before render", () => {
  assert.deepEqual(sanitizeVideoProducerTransform({ focusX: -1, focusY: 3, scale: 9 }), { focusX: 0, focusY: 1, scale: 2.5 });
  assert.deepEqual(sanitizeVideoProducerTransform({ focusX: Number.NaN, focusY: Number.NaN, scale: Number.NaN }), { focusX: 0.5, focusY: 0.5, scale: 1 });
});

test("podcast defaults produce a professional 16:9 master", () => {
  const plan = buildDefaultVideoProducerPlan("podcast", 120);
  const render = compileVideoProducerRenderPlan(plan);
  assert.equal(plan.captions.enabled, false);
  assert.equal(plan.intro, true);
  assert.equal(plan.outro, true);
  assert.equal(plan.audioPreset, "ag-voice-clean");
  assert.deepEqual(render.output, { format: "mp4", width: 1920, height: 1080, fps: 30 });
});

test("reels defaults produce a vertical captioned master", () => {
  const plan = buildDefaultVideoProducerPlan("reels", 45);
  const render = compileVideoProducerRenderPlan(plan);
  assert.equal(plan.captions.enabled, true);
  assert.equal(plan.captions.highlightCurrentWord, true);
  assert.equal(plan.captions.animation, "highlight");
  assert.equal(plan.audioPreset, "ag-voice-punch");
  assert.equal(plan.intro, false);
  assert.deepEqual(render.output, { format: "mp4", width: 1080, height: 1920, fps: 30 });
});

test("compiles overlays, motion and music into cut-aware output ranges", () => {
  const plan: VideoProducerEditPlan = {
    version: 2,
    mode: "reels",
    sourceDuration: 60,
    cuts: [{ id: "cut", start: 10, end: 20 }],
    overlays: [{ id: "verse", kind: "scripture", start: 8, duration: 14, title: "John 14:9", animation: "rise", placement: "center" }],
    motion: [{ id: "push", kind: "punch-in", start: 30, duration: 2, intensity: "subtle", transform: { focusX: 1.4, focusY: -0.2, scale: 1.18 } }],
    music: [{ id: "bed", trackId: "ag-bed", start: 5, end: 25, gainDb: -24, duckUnderVoice: true }],
    captions: { enabled: true, style: "kinetic-clean", animation: "highlight", maxWordsPerCard: 5, position: "lower", highlightCurrentWord: true },
    audioPreset: "ag-voice-punch",
    colorPreset: "ag-clean",
    intro: false,
    outro: false
  };
  const render = compileVideoProducerRenderPlan(plan);
  assert.equal(render.outputDuration, 50);
  assert.equal(render.overlays[0]?.outputStart, 8);
  assert.equal(render.overlays[0]?.animation, "rise");
  assert.deepEqual(render.overlays[0]?.outputRanges, [
    { sourceStart: 8, sourceEnd: 10, outputStart: 8, outputEnd: 10 },
    { sourceStart: 20, sourceEnd: 22, outputStart: 10, outputEnd: 12 }
  ]);
  assert.equal(render.motion[0]?.outputStart, 20);
  assert.deepEqual(render.motion[0]?.transform, { focusX: 1, focusY: 0, scale: 1.18 });
  assert.deepEqual(render.music[0]?.outputRanges, [
    { sourceStart: 5, sourceEnd: 10, outputStart: 5, outputEnd: 10 },
    { sourceStart: 20, sourceEnd: 25, outputStart: 10, outputEnd: 15 }
  ]);
});

test("slices an inherited podcast transcript onto a reel-local zero timeline", () => {
  const transcript = normalizeVideoProducerTranscript({
    text: "before one two after",
    duration: 140,
    words: [
      { word: "before", start: 99, end: 99.5 },
      { word: "one", start: 100, end: 100.5 },
      { word: "two", start: 109, end: 109.5 },
      { word: "after", start: 121, end: 121.5 }
    ],
    segments: [
      { text: "one two", start: 100, end: 110 },
      { text: "after", start: 121, end: 122 }
    ]
  });
  const local = sliceVideoProducerTranscript(transcript, 100, 120);
  assert.equal(local.duration, 20);
  assert.equal(local.text, "one two");
  assert.deepEqual(local.words, [
    { word: "one", start: 0, end: 0.5 },
    { word: "two", start: 9, end: 9.5 }
  ]);
  assert.deepEqual(local.segments, [{ text: "one two", start: 0, end: 10 }]);
});

test("director normalization accepts strict-schema nulls and clamps visual transforms", () => {
  const directed = normalizeVideoProducerDirectorOutput({
    summary: "Tighten the setup and show the verse.",
    cuts: [{ start: 2, end: 3, reason: "false start" }],
    overlays: [{
      kind: "scripture", start: 5, duration: 4, title: "John 14:9",
      body: null, reference: "John 14:9", animation: null, placement: null
    }],
    motion: [{
      kind: "punch-in", start: 7, duration: 1.5, intensity: null,
      focusX: 2, focusY: -1, scale: 8, note: null
    }]
  }, "reels", 30);
  assert.equal(directed.plan.overlays[0]?.animation, "rise");
  assert.equal(directed.plan.overlays[0]?.placement, "center");
  assert.deepEqual(directed.plan.motion[0]?.transform, { focusX: 1, focusY: 0, scale: 2.5 });
  assert.equal(directed.plan.cuts[0]?.start, 2);
});

test("podcast director guard rejects destructive over-cut plans", () => {
  assert.throws(() => normalizeVideoProducerDirectorOutput({
    summary: "Too aggressive",
    cuts: [{ start: 0, end: 30, reason: "remove half" }],
    overlays: [],
    motion: []
  }, "podcast", 60), /more than 35%/);
});

test("reel candidate normalization removes overlapping selections and invalid durations", () => {
  const candidates = normalizeVideoProducerReelCandidates({ candidates: [
    { start: 10, end: 50, hook: "A", title: "Best", score: 95, reason: "strong" },
    { start: 15, end: 48, hook: "B", title: "Overlap", score: 90, reason: "same moment" },
    { start: 80, end: 105, hook: "C", title: "Second", score: 88, reason: "separate" },
    { start: 130, end: 135, hook: "D", title: "Too short", score: 100, reason: "invalid" }
  ] }, 180);
  assert.deepEqual(candidates.map((candidate) => candidate.title), ["Best", "Second"]);
});
