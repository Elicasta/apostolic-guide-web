import assert from "node:assert/strict";
import test from "node:test";
import {
  VIDEO_PRODUCER_PRIMARY_CAMERA_ID,
  buildSmartVideoProducerCameraDecisions,
  getVideoProducerMulticamMetadata,
  normalizeVideoProducerCameraDecisions,
  videoProducerMulticamFingerprintState
} from "../src/video-producer-multicam";

const camera = {
  id: "camera-b",
  label: "Camera B",
  provider: "vercel_blob" as const,
  locator: "video-producer/sources/p/camera-b/b.mp4",
  filename: "b.mp4",
  mimeType: "video/mp4",
  sizeBytes: 1234,
  duration: 60
};

test("normalizes camera decisions into one gap-free timeline", () => {
  const result = normalizeVideoProducerCameraDecisions([
    { id: "b", sourceId: "camera-b", start: 5, end: 12 },
    { id: "a", sourceId: VIDEO_PRODUCER_PRIMARY_CAMERA_ID, start: 12, end: 18 }
  ], 20, ["camera-b"]);
  assert.equal(result[0].start, 0);
  assert.equal(result.at(-1)?.end, 20);
  for (let index = 1; index < result.length; index += 1) assert.equal(result[index - 1].end, result[index].start);
});

test("smart camera switching works with any number of cameras", () => {
  const result = buildSmartVideoProducerCameraDecisions({
    words: [
      { start: 0, end: 5.8, word: "one" },
      { start: 6.4, end: 12.2, word: "two" },
      { start: 12.8, end: 20, word: "three" },
      { start: 20.6, end: 28, word: "four" }
    ]
  }, 32, ["camera-b", "camera-c"]);
  assert.equal(result[0].start, 0);
  assert.equal(result.at(-1)?.end, 32);
  assert.ok(result.some((item) => item.sourceId === "camera-b"));
  assert.ok(result.some((item) => item.sourceId === "camera-c"));
  assert.ok(result.every((item) => item.end > item.start));
});

test("single camera keeps the existing Camera A behavior", () => {
  const result = buildSmartVideoProducerCameraDecisions(null, 30, []);
  assert.deepEqual(result, [{ id: "camera-cut-1", sourceId: VIDEO_PRODUCER_PRIMARY_CAMERA_ID, start: 0, end: 30 }]);
});

test("metadata parser discards malformed camera data", () => {
  const parsed = getVideoProducerMulticamMetadata({ multicam: { cameras: [{ id: "camera-b" }, camera] } });
  assert.equal(parsed.cameras.length, 1);
  assert.equal(parsed.cameras[0].id, "camera-b");
});

test("fingerprint excludes transient analysis UI data but includes render decisions", () => {
  const base = {
    multicam: {
      version: 1,
      cameras: [camera],
      analysis: {
        status: "ready",
        callbackTokenHash: "secret-one",
        cameraOffsetsMs: { "camera-b": 1200 },
        cameraConfidence: { "camera-b": 0.93 },
        cameraDurations: { "camera-b": 60 },
        waveforms: { "camera-a": [1, 2, 3], "camera-b": [2, 4, 6] }
      },
      editDecisions: [
        { id: "1", sourceId: VIDEO_PRODUCER_PRIMARY_CAMERA_ID, start: 0, end: 8 },
        { id: "2", sourceId: "camera-b", start: 8, end: 16 }
      ]
    }
  };
  const first = videoProducerMulticamFingerprintState(base);
  const second = videoProducerMulticamFingerprintState({
    multicam: {
      ...(base.multicam),
      analysis: { ...(base.multicam.analysis), callbackTokenHash: "secret-two", waveforms: { "camera-a": [99] } }
    }
  });
  assert.deepEqual(first, second);
  const changed = videoProducerMulticamFingerprintState({
    multicam: {
      ...(base.multicam),
      analysis: { ...(base.multicam.analysis), cameraOffsetsMs: { "camera-b": 1300 } }
    }
  });
  assert.notDeepEqual(first, changed);
});
