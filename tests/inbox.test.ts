import assert from "node:assert/strict";
import test from "node:test";
import { instagramReplyWindowOpen } from "../src/inbox";

test("Instagram manual replies require a recent inbound message", () => {
  assert.equal(instagramReplyWindowOpen(null), false);
  assert.equal(instagramReplyWindowOpen(new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString()), true);
  assert.equal(instagramReplyWindowOpen(new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()), false);
});
