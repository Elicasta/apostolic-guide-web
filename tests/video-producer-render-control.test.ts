import assert from "node:assert/strict";
import test from "node:test";
import { videoProducerRenderControl } from "../src/video-producer-render-control";

test("active renders expose an explicit restart action", () => {
  const control = videoProducerRenderControl("rendering", "rendering", true);
  assert.equal(control?.action, "restart");
  assert.equal(control?.force, true);
  assert.equal(control?.label, "RESTART RENDER");
});

test("failed renders can be retried without force", () => {
  const control = videoProducerRenderControl("approved", "failed", true);
  assert.equal(control?.action, "retry");
  assert.equal(control?.force, false);
});

test("completed review masters can be rendered again", () => {
  const control = videoProducerRenderControl("review", "completed", true);
  assert.equal(control?.action, "rerender");
  assert.equal(control?.label, "RENDER AGAIN");
});

test("render controls never appear without an approved edit", () => {
  assert.equal(videoProducerRenderControl("rendering", "rendering", false), null);
  assert.equal(videoProducerRenderControl("review", "completed", false), null);
});

test("ordinary approved projects still use the normal render button", () => {
  assert.equal(videoProducerRenderControl("approved", undefined, true), null);
});
