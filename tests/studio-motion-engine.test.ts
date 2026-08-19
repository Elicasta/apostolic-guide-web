import assert from "node:assert/strict";
import test from "node:test";
import {
  APOSTOLIC_MOTION_ENGINE_VERSION,
  APOSTOLIC_MOTION_STYLE,
  activeApostolicMotionScene,
  apostolicMotionEngineStyle,
  apostolicMotionPlanFromStyle,
  buildApostolicMotionPlan
} from "../src/apostolic-motion-engine";
import type { PathwayVideoCue, PathwayVideoTimelineSource } from "../src/pathway-video";

const source: PathwayVideoTimelineSource = {
  slug: "god-is-one",
  title: "God Is One",
  summary: "Follow Scripture's consistent witness that God is one.",
  steps: [
    { title: "The Foundational Confession", reference: "Deuteronomy 6:4", explanation: "The LORD our God is one LORD." },
    { title: "No God Before or After Him", reference: "Isaiah 43:10", explanation: "No God was formed before Him or after Him." },
    { title: "Jesus Repeats the Shema", reference: "Mark 12:29", explanation: "Jesus identifies the first commandment with Israel's confession." },
    { title: "The Apostolic Witness", reference: "1 Corinthians 8:4-6", explanation: "The apostles preserve the confession of one God." }
  ]
};

const timeline: PathwayVideoCue[] = [
  { id: "q", start: 0, kind: "question", eyebrow: "GOD IS ONE", title: "WHAT DOES SCRIPTURE REVEAL?", body: "", reference: "GOD IS ONE" },
  { id: "brand", start: 5, kind: "brand", eyebrow: "APOSTOLIC GUIDE", title: "GOD IS ONE", body: "", reference: "GOD IS ONE" },
  { id: "d64", start: 12, kind: "scripture", eyebrow: "DEUTERONOMY 6:4", title: "THE FOUNDATIONAL CONFESSION", body: "The LORD our God is one LORD.", reference: "DEUTERONOMY 6:4" },
  { id: "isa", start: 27, kind: "scripture", eyebrow: "ISAIAH 43:10", title: "NO GOD BEFORE OR AFTER HIM", body: "No God was formed before Him or after Him.", reference: "ISAIAH 43:10" },
  { id: "mark", start: 42, kind: "scripture", eyebrow: "MARK 12:29", title: "JESUS REPEATS THE SHEMA", body: "Hear, O Israel, the Lord our God is one Lord.", reference: "MARK 12:29" },
  { id: "cor", start: 58, kind: "scripture", eyebrow: "1 CORINTHIANS 8:4-6", title: "THE APOSTOLIC WITNESS", body: "There is none other God but one.", reference: "1 CORINTHIANS 8:4-6" },
  { id: "recap", start: 76, kind: "recap", eyebrow: "THE PATHWAY", title: "GOD IS ONE", body: "Law, prophets, Jesus, and the apostles agree.", reference: "GOD IS ONE" },
  { id: "cta", start: 86, kind: "cta", eyebrow: "PATHWAY COMPLETE", title: "CONTINUE STUDYING", body: "Continue at ApostolicGuide.com", reference: "APOSTOLIC GUIDE" }
];

test("God Is One maps into the fixed Apostolic motion grammar", () => {
  const plan = buildApostolicMotionPlan(source, timeline, 92);
  assert.equal(plan.version, APOSTOLIC_MOTION_ENGINE_VERSION);
  assert.equal(plan.style, APOSTOLIC_MOTION_STYLE);
  assert.equal(plan.composition, "continuous-canvas");
  assert.equal(plan.scenes.find((scene) => scene.cueId === "d64")?.visual, "shema");
  assert.equal(plan.scenes.find((scene) => scene.cueId === "isa")?.visual, "no-rival");
  assert.equal(plan.scenes.find((scene) => scene.cueId === "mark")?.visual, "jesus-shema");
  assert.equal(plan.scenes.find((scene) => scene.cueId === "cor")?.visual, "apostolic-witness");
  assert.equal(plan.scenes.find((scene) => scene.cueId === "recap")?.visual, "recap-map");
});

test("scene timing stays ordered and bounded by the audio", () => {
  const plan = buildApostolicMotionPlan(source, timeline, 92);
  let previousStart = -1;
  for (const scene of plan.scenes) {
    assert.ok(scene.start >= previousStart);
    assert.ok(scene.end > scene.start);
    assert.ok(scene.end <= plan.duration);
    previousStart = scene.start;
  }
  assert.equal(plan.pilotWindowSeconds, 90);
  assert.equal(activeApostolicMotionScene(plan, 44)?.cueId, "mark");
});

test("saved style round-trips the exact motion plan", () => {
  const plan = buildApostolicMotionPlan(source, timeline, 92);
  const style = { motionEngine: apostolicMotionEngineStyle(plan) };
  const restored = apostolicMotionPlanFromStyle(style);
  assert.deepEqual(restored, plan);
  assert.ok(JSON.stringify(style).length < 50_000, "repository dispatch payload needs to stay compact");
});

test("non-pilot Scripture still gets a safe deterministic fallback", () => {
  const other: PathwayVideoTimelineSource = {
    slug: "sample",
    title: "Sample",
    summary: "Sample summary",
    steps: [{ title: "A verse", reference: "Psalm 1:1", explanation: "A verse explanation." }]
  };
  const cues: PathwayVideoCue[] = [{ id: "verse", start: 0, kind: "scripture", eyebrow: "PSALM 1:1", title: "A VERSE", body: "A verse explanation.", reference: "PSALM 1:1" }];
  const plan = buildApostolicMotionPlan(other, cues, 20);
  assert.equal(plan.scenes[0]?.visual, "scripture-scroll");
});
