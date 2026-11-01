import assert from "node:assert/strict";
import test from "node:test";
import {
  canTransitionCreativeStatus,
  copyAllFrameCaptions,
  createDefaultFrames,
  normalizeCreativeFrames,
  recommendedFrameCount,
  reorderCreativeFrames
} from "../src/creative-project";

test("Single Post is always exactly one frame", () => {
  const frames = createDefaultFrames("single", 9);
  assert.equal(frames.length, 1);
  const normalized = normalizeCreativeFrames("single", [
    { id: "a", headline: "First" },
    { id: "b", headline: "Second" }
  ]);
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].headline, "First");
});

test("recommended counts vary by format and intent instead of hard-coding eight", () => {
  assert.equal(recommendedFrameCount("single", "teaching", 6), 1);
  assert.equal(recommendedFrameCount("story", "quote", 6), 3);
  assert.equal(recommendedFrameCount("carousel", "objection", 6), 8);
  assert.equal(recommendedFrameCount("carousel", "information", 4), 5);
});

test("publishing status transitions reject unsafe jumps but allow recovery", () => {
  assert.equal(canTransitionCreativeStatus("draft", "published"), false);
  assert.equal(canTransitionCreativeStatus("draft", "ready"), true);
  assert.equal(canTransitionCreativeStatus("publishing", "failed"), true);
  assert.equal(canTransitionCreativeStatus("failed", "ready"), true);
  assert.equal(canTransitionCreativeStatus("archived", "draft"), true);
});

test("reordering preserves frame identity and rewrites display order", () => {
  const frames = createDefaultFrames("carousel", 4).map((frame, index) => ({ ...frame, id: `f${index + 1}`, headline: `Frame ${index + 1}` }));
  const reordered = reorderCreativeFrames(frames, "f4", 1);
  assert.deepEqual(reordered.map((frame) => frame.id), ["f1", "f4", "f2", "f3"]);
  assert.deepEqual(reordered.map((frame) => frame.order), [1, 2, 3, 4]);
});

test("Copy All Slide Captions produces clearly separated sections", () => {
  const frames = createDefaultFrames("carousel", 3).map((frame, index) => ({ ...frame, caption: `Caption ${index + 1}` }));
  assert.equal(copyAllFrameCaptions(frames), "SLIDE 1\nCaption 1\n\nSLIDE 2\nCaption 2\n\nSLIDE 3\nCaption 3");
});
