import assert from "node:assert/strict";
import test from "node:test";
import { canDeleteCommentGuideJob, canSendCommentGuideJobNow } from "../src/comment-guide-runtime";

test("Reply now is limited to approved jobs waiting for delivery", () => {
  assert.equal(canSendCommentGuideJobNow("scheduled"), true);
  assert.equal(canSendCommentGuideJobNow("delivery_retry"), true);
  assert.equal(canSendCommentGuideJobNow("received"), false);
  assert.equal(canSendCommentGuideJobNow("classifying"), false);
  assert.equal(canSendCommentGuideJobNow("sent"), false);
});

test("deletion cannot race a job that is actively classifying or sending", () => {
  assert.equal(canDeleteCommentGuideJob("scheduled"), true);
  assert.equal(canDeleteCommentGuideJob("sent"), true);
  assert.equal(canDeleteCommentGuideJob("failed"), true);
  assert.equal(canDeleteCommentGuideJob("classifying"), false);
  assert.equal(canDeleteCommentGuideJob("sending"), false);
});
