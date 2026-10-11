import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildDefaultVideoProducerPlan,
  buildKeepSegments,
  compileVideoProducerRenderPlan,
  sourceTimeToOutputTime,
} from "../src/video-producer";
import {
  buildProducerScenes,
  editHistory,
  producerEditorPlanSchema,
  replaceSceneCuts,
  sceneKeepRanges,
  trimProducerScene,
} from "../src/video-producer-editor";

test("scenes partition local source time, including silence before and after speech", () => {
  const scenes = buildProducerScenes(
    [
      { start: 3, end: 6, text: "First thought." },
      { start: 8, end: 10, text: "Same thought." },
      { start: 15, end: 19, text: "Next thought." },
    ],
    24,
  );
  assert.deepEqual(
    scenes.map((s) => [s.start, s.end]),
    [
      [0, 15],
      [15, 24],
    ],
  );
  assert.equal(scenes[0].text, "First thought. Same thought.");
  assert.deepEqual(
    buildProducerScenes([], 25).map((s) => [s.start, s.end]),
    [
      [0, 12],
      [12, 24],
      [24, 25],
    ],
  );
  assert.deepEqual(buildProducerScenes([], NaN), []);
});
test("restoring a scene preserves cuts on both neighboring scenes", () => {
  const plan = buildDefaultVideoProducerPlan("podcast", 30);
  plan.cuts = [{ id: "cross", start: 5, end: 25 }];
  const scene = { id: "middle", start: 10, end: 20, text: "Middle." };
  const restored = replaceSceneCuts(plan, scene, []);
  assert.deepEqual(
    restored.cuts.map((c) => [c.start, c.end]),
    [
      [5, 10],
      [20, 25],
    ],
  );
  assert.deepEqual(buildKeepSegments(restored.cuts, 30), [
    { start: 0, end: 5 },
    { start: 10, end: 20 },
    { start: 25, end: 30 },
  ]);
  assert.deepEqual(
    plan.cuts.map((c) => [c.start, c.end]),
    [[5, 25]],
  );
});
test("trim handles can extend again while keeping the director's internal cut", () => {
  const plan = buildDefaultVideoProducerPlan("podcast", 30);
  plan.cuts = [
    { id: "hesitation", start: 14, end: 15 },
    { id: "other", start: 25, end: 27 },
  ];
  const scene = { id: "middle", start: 10, end: 20, text: "Middle." };
  const tight = trimProducerScene(plan, scene, 12, 18);
  const extended = trimProducerScene(tight, scene, 11, 19);
  assert.deepEqual(sceneKeepRanges(extended, scene), [
    { start: 11, end: 14 },
    { start: 15, end: 19 },
  ]);
  assert.ok(extended.cuts.some((c) => c.start === 25 && c.end === 27));
  assert.equal(trimProducerScene(plan, scene, NaN, 18), plan);
  assert.equal(trimProducerScene(plan, scene, 19, 18), plan);
});
test("scene removal compiles onto the same output clock as graphics and child-reel captions", () => {
  const plan = buildDefaultVideoProducerPlan("reels", 30);
  plan.overlays = [
    {
      id: "truth",
      kind: "statement",
      start: 18,
      duration: 6,
      title: "Spoken words",
    },
  ];
  const edited = replaceSceneCuts(
    plan,
    { id: "scene", start: 10, end: 20, text: "" },
    [{ id: "remove", start: 10, end: 20 }],
  );
  const render = compileVideoProducerRenderPlan(edited);
  assert.equal(render.outputDuration, 20);
  assert.equal(sourceTimeToOutputTime(22, edited.cuts, 30), 12);
  assert.deepEqual(render.overlays[0].outputRanges, [
    { sourceStart: 20, sourceEnd: 24, outputStart: 10, outputEnd: 14 },
  ]);
});
test("undo and redo restore the whole document including scene locks", () => {
  const original = {
    plan: buildDefaultVideoProducerPlan("podcast", 30),
    lockedScenes: [] as string[],
  };
  let history = {
    past: [] as (typeof original)[],
    present: original,
    future: [] as (typeof original)[],
  };
  const next = { ...original, lockedScenes: ["scene-0"] };
  history = editHistory(history, next);
  assert.deepEqual(editHistory(history, "undo").present, original);
  assert.deepEqual(
    editHistory(editHistory(history, "undo"), "redo").present,
    next,
  );
  assert.equal(
    editHistory(editHistory(history, "undo"), {
      ...original,
      lockedScenes: ["scene-1"],
    }).future.length,
    0,
  );
});
test("server validation rejects empty films, invalid IDs, bad times, and impossible graphics", () => {
  const base = buildDefaultVideoProducerPlan("podcast", 30);
  assert.equal(producerEditorPlanSchema.safeParse(base).success, true);
  const invalid = [
    { ...base, cuts: [{ id: "all", start: 0, end: 30 }] },
    { ...base, cuts: [{ id: "a", start: NaN, end: 5 }] },
    {
      ...base,
      cuts: [
        { id: "a", start: 1, end: 5 },
        { id: "a", start: 7, end: 8 },
      ],
    },
    {
      ...base,
      overlays: [
        { id: "late", kind: "statement", start: 29, duration: 4, title: "No" },
      ],
    },
    {
      ...base,
      motion: [
        {
          id: "m",
          kind: "punch-in",
          start: 2,
          duration: 4,
          transform: { focusX: 2, focusY: 0.5, scale: 1.1 },
        },
      ],
    },
  ];
  for (const plan of invalid)
    assert.equal(producerEditorPlanSchema.safeParse(plan).success, false);
});

test("extending a trim preserves director cuts previously hidden by that trim", () => {
  const plan = buildDefaultVideoProducerPlan("podcast", 30);
  plan.cuts = [{ id: "director", start: 12, end: 13 }];
  const scene = { id: "middle", start: 10, end: 20, text: "" };
  const edited = trimProducerScene(
    trimProducerScene(plan, scene, 14, 18),
    scene,
    11,
    19,
  );
  assert.deepEqual(sceneKeepRanges(edited, scene), [
    { start: 11, end: 12 },
    { start: 13, end: 19 },
  ]);
});
