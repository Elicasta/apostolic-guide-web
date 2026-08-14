import test from "node:test";
import assert from "node:assert/strict";
import {
  isVideoProducerWorkerStale,
  VIDEO_PRODUCER_RENDER_STALE_MS,
  VIDEO_PRODUCER_TRANSCRIPTION_STALE_MS,
  VIDEO_PRODUCER_UPLOAD_STALE_MS
} from "../src/video-producer-job-state";

const NOW = Date.parse("2026-08-14T04:00:00.000Z");

function isoBefore(milliseconds: number) {
  return new Date(NOW - milliseconds).toISOString();
}

test("missing or invalid worker heartbeat never self-fails", () => {
  assert.equal(isVideoProducerWorkerStale(null, VIDEO_PRODUCER_TRANSCRIPTION_STALE_MS, NOW), false);
  assert.equal(isVideoProducerWorkerStale("not-a-date", VIDEO_PRODUCER_TRANSCRIPTION_STALE_MS, NOW), false);
});

test("active multipart upload is protected through the six-hour recovery boundary", () => {
  assert.equal(isVideoProducerWorkerStale(isoBefore(VIDEO_PRODUCER_UPLOAD_STALE_MS), VIDEO_PRODUCER_UPLOAD_STALE_MS, NOW), false);
});

test("missing upload becomes recoverable only after six hours", () => {
  assert.equal(isVideoProducerWorkerStale(isoBefore(VIDEO_PRODUCER_UPLOAD_STALE_MS + 1), VIDEO_PRODUCER_UPLOAD_STALE_MS, NOW), true);
});

test("transcription stays active at and just below the recovery boundary", () => {
  assert.equal(isVideoProducerWorkerStale(isoBefore(VIDEO_PRODUCER_TRANSCRIPTION_STALE_MS - 1), VIDEO_PRODUCER_TRANSCRIPTION_STALE_MS, NOW), false);
  assert.equal(isVideoProducerWorkerStale(isoBefore(VIDEO_PRODUCER_TRANSCRIPTION_STALE_MS), VIDEO_PRODUCER_TRANSCRIPTION_STALE_MS, NOW), false);
});

test("transcription becomes stale only after the two-hour recovery margin", () => {
  assert.equal(isVideoProducerWorkerStale(isoBefore(VIDEO_PRODUCER_TRANSCRIPTION_STALE_MS + 1), VIDEO_PRODUCER_TRANSCRIPTION_STALE_MS, NOW), true);
});

test("render stays active through the three-minute heartbeat recovery boundary", () => {
  assert.equal(isVideoProducerWorkerStale(isoBefore(VIDEO_PRODUCER_RENDER_STALE_MS), VIDEO_PRODUCER_RENDER_STALE_MS, NOW), false);
});

test("render becomes retryable immediately after the three-minute heartbeat margin", () => {
  assert.equal(isVideoProducerWorkerStale(isoBefore(VIDEO_PRODUCER_RENDER_STALE_MS + 1), VIDEO_PRODUCER_RENDER_STALE_MS, NOW), true);
});
