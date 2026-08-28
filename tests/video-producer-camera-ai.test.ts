import assert from "node:assert/strict";
import test from "node:test";
import { normalizeVideoProducerCameraDirectorOutput } from "../src/video-producer-camera-ai";
import type { VideoProducerTranscript } from "../src/video-producer-ai";
import type { VideoProducerCameraPlan } from "../src/video-producer-multicam";

const transcript: VideoProducerTranscript = {
  text: "One sentence. Another sentence. Strong conclusion.",
  duration: 30,
  words: [
    { word: "One", start: 0, end: .4 }, { word: "sentence", start: .5, end: 2 },
    { word: "Another", start: 6, end: 6.5 }, { word: "sentence", start: 6.6, end: 9 },
    { word: "Strong", start: 15, end: 15.5 }, { word: "conclusion", start: 15.6, end: 18 }
  ],
  segments: [
    { text: "One sentence.", start: 0, end: 5 },
    { text: "Another sentence.", start: 6, end: 12 },
    { text: "Strong conclusion.", start: 15, end: 22 }
  ]
};

test("Smart Auto Cut snaps near phrase boundaries and removes rapid ping-pong", () => {
  const directed = normalizeVideoProducerCameraDirectorOutput({
    summary: "Use B for the middle reset.",
    decisions: [
      { at: 5.6, camera: "B", reason: "reset" },
      { at: 7, camera: "A", reason: "too fast" },
      { at: 12.3, camera: "A", reason: "return" }
    ]
  }, { duration: 30, transcript, coverage: { start: 3, end: 25 }, mode: "podcast" });
  assert.equal(directed.plan.decisions[0]?.camera, "B");
  assert.ok((directed.plan.decisions[0]?.at ?? 0) >= 5);
  assert.ok(directed.plan.decisions.every((decision, index, all) => index === 0 || decision.at - all[index - 1].at >= 4));
});

test("Smart Auto Cut never selects Camera B outside synchronized coverage", () => {
  const directed = normalizeVideoProducerCameraDirectorOutput({
    summary: "",
    decisions: [
      { at: 2, camera: "B", reason: "too early" },
      { at: 6, camera: "B", reason: "valid" },
      { at: 12, camera: "A", reason: "return" }
    ]
  }, { duration: 30, transcript, coverage: { start: 4, end: 20 }, mode: "podcast" });
  assert.ok(directed.plan.decisions.every((decision) => decision.camera !== "B" || (decision.at >= 4 && decision.at < 20)));
});

test("locked human Camera Plan decisions survive regeneration", () => {
  const existing: VideoProducerCameraPlan = {
    version: 1,
    defaultCamera: "A",
    decisions: [
      { id: "human-b", at: 15, camera: "B", source: "manual", locked: true },
      { id: "human-a", at: 20, camera: "A", source: "manual", locked: true }
    ]
  };
  const directed = normalizeVideoProducerCameraDirectorOutput({
    summary: "",
    decisions: [{ at: 14.9, camera: "B", reason: "model duplicate" }, { at: 24, camera: "B", reason: "later" }]
  }, { duration: 30, transcript, coverage: { start: 0, end: 30 }, existingPlan: existing, mode: "podcast" });
  assert.ok(directed.plan.decisions.some((decision) => decision.id === "human-b" && decision.locked));
  assert.ok(directed.plan.decisions.some((decision) => decision.id === "human-a" && decision.locked));
});

test("Podcast Smart Auto Cut keeps Camera A dominant", () => {
  const directed = normalizeVideoProducerCameraDirectorOutput({
    summary: "too much B",
    decisions: [
      { at: 4, camera: "B", reason: "b" }, { at: 14, camera: "A", reason: "a" },
      { at: 18, camera: "B", reason: "b" }, { at: 28, camera: "A", reason: "a" }
    ]
  }, { duration: 30, transcript, coverage: { start: 0, end: 30 }, mode: "podcast" });
  const bStarts = directed.plan.decisions.filter((decision) => decision.camera === "B");
  assert.ok(bStarts.length <= 1, directed.plan.decisions);
});
