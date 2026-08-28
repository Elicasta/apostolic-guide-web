import assert from "node:assert/strict";
import test from "node:test";
import {
  assetTimeToProjectTime,
  buildVideoProducerCameraSegments,
  compileCameraRangesThroughContentCuts,
  defaultVideoProducerAudioPlan,
  mediaLocalCoverage,
  mediaProjectCoverage,
  normalizeVideoProducerCameraPlan,
  preserveLockedCameraDecisions,
  projectTimeToAssetTime,
  videoProducerProductionFingerprintInput,
  type VideoProducerCameraPlan
} from "../src/video-producer-multicam";

test("positive and negative waveform offsets round-trip project time", () => {
  assert.equal(assetTimeToProjectTime(10, 4.38), 14.38);
  assert.equal(projectTimeToAssetTime(14.38, 4.38), 10);
  assert.equal(assetTimeToProjectTime(10, -2.14), 7.86);
  assert.equal(projectTimeToAssetTime(7.86, -2.14), 10);
});

test("media coverage maps into a child reel local range", () => {
  assert.deepEqual(mediaProjectCoverage(50, 4), { start: 4, end: 54 });
  assert.deepEqual(mediaLocalCoverage(50, 4, 10, 30), { start: 0, end: 20 });
  assert.deepEqual(mediaLocalCoverage(10, 25, 10, 20), null);
});

test("camera plan stays Camera A authority and clamps Camera B to coverage", () => {
  const plan: VideoProducerCameraPlan = {
    version: 1,
    defaultCamera: "A",
    decisions: [
      { id: "b", at: 5, camera: "B", source: "auto", locked: false },
      { id: "a", at: 12, camera: "A", source: "auto", locked: false },
      { id: "bad-b", at: 18, camera: "B", source: "auto", locked: false }
    ]
  };
  const normalized = normalizeVideoProducerCameraPlan(plan, 20, { start: 3, end: 15 });
  assert.deepEqual(normalized.decisions.map((item) => [item.at, item.camera]), [[5, "B"], [12, "A"]]);
  assert.deepEqual(buildVideoProducerCameraSegments(plan, 20, { start: 3, end: 15 }), [
    { camera: "A", start: 0, end: 5 },
    { camera: "B", start: 5, end: 12 },
    { camera: "A", start: 12, end: 20 }
  ]);
});

test("content removals and camera switches compile onto one output timeline", () => {
  const cameraPlan: VideoProducerCameraPlan = {
    version: 1,
    defaultCamera: "A",
    decisions: [
      { id: "b", at: 4, camera: "B", source: "auto", locked: false },
      { id: "a", at: 9, camera: "A", source: "auto", locked: false }
    ]
  };
  const ranges = compileCameraRangesThroughContentCuts(
    cameraPlan,
    [{ id: "remove", start: 6, end: 8 }],
    12,
    { start: 0, end: 12 }
  );
  assert.deepEqual(ranges, [
    { camera: "A", start: 0, end: 4, outputStart: 0, outputEnd: 4 },
    { camera: "B", start: 4, end: 6, outputStart: 4, outputEnd: 6 },
    { camera: "B", start: 8, end: 9, outputStart: 6, outputEnd: 7 },
    { camera: "A", start: 9, end: 12, outputStart: 7, outputEnd: 10 }
  ]);
});

test("locked manual camera decisions survive regeneration", () => {
  const existing: VideoProducerCameraPlan = {
    version: 1,
    defaultCamera: "A",
    decisions: [{ id: "locked", at: 10, camera: "B", source: "manual", locked: true }]
  };
  const generated = [
    { id: "near", at: 10.1, camera: "B" as const, source: "auto" as const, locked: false },
    { id: "later", at: 18, camera: "A" as const, source: "auto" as const, locked: false }
  ];
  assert.deepEqual(preserveLockedCameraDecisions(generated, existing).map((item) => item.id), ["locked", "later"]);
});

test("single camera production fingerprint input remains exactly the legacy content plan", () => {
  const content = { version: 2, cuts: [] };
  assert.equal(videoProducerProductionFingerprintInput({ contentPlan: content }), content);
  assert.equal(videoProducerProductionFingerprintInput({ contentPlan: content, audioPlan: defaultVideoProducerAudioPlan() }), content);
});

test("multicam fingerprint includes camera audio and synchronized media revisions", () => {
  const value = videoProducerProductionFingerprintInput({
    contentPlan: { version: 2 },
    cameraPlan: { version: 1, defaultCamera: "A", decisions: [] },
    audioPlan: { version: 1, source: "external_audio", assetId: "audio", offsetSeconds: 1.2, syncRevision: 3 },
    media: [{ id: "audio", role: "external_audio", revision: 3, sync_status: "synced", offset_seconds: 1.2, active: true }]
  });
  assert.equal((value as { version: number }).version, 1);
});
