import assert from "node:assert/strict";
import test from "node:test";
import {
  applyTeleprompterAction,
  isTeleprompterSessionState,
  normalizeTeleprompterState,
} from "../src/lib/teleprompter/session-state";
import type { TeleprompterSessionState } from "../src/lib/teleprompter/types";

const baseState: TeleprompterSessionState = {
  title: "Episode 2",
  documentId: "episode-2",
  slideIndex: 0,
  theme: "night",
  mode: "script",
  fontScale: 1,
  locked: false,
  scrolling: false,
  scrollSpeed: 60,
  scrollTopSequence: 0,
  slides: [
    { id: "one", heading: "One", preview: "One" },
    { id: "two", heading: "Two", preview: "Two" },
  ],
  sequence: 1,
  updatedAt: 1,
  actorId: "display:test",
};

test("legacy teleprompter session state remains accepted and receives scroll defaults", () => {
  const legacy = {
    ...baseState,
    scrolling: undefined,
    scrollSpeed: undefined,
    scrollTopSequence: undefined,
  };

  assert.equal(isTeleprompterSessionState(legacy), true);
  const normalized = normalizeTeleprompterState(legacy as unknown as TeleprompterSessionState);
  assert.equal(normalized.scrolling, false);
  assert.equal(normalized.scrollSpeed, 60);
  assert.equal(normalized.scrollTopSequence, 0);
});

test("slide navigation automatically stops auto-scroll", () => {
  const running = { ...baseState, scrolling: true };
  const next = applyTeleprompterAction(running, { type: "next" }, "remote:test", 2);

  assert.equal(next.slideIndex, 1);
  assert.equal(next.scrolling, false);
});

test("scroll speed is clamped to safe reading limits", () => {
  const slow = applyTeleprompterAction(baseState, { type: "scrollSpeed", scrollSpeed: 1 }, "remote:test", 2);
  const fast = applyTeleprompterAction(baseState, { type: "scrollSpeed", scrollSpeed: 500 }, "remote:test", 3);

  assert.equal(slow.scrollSpeed, 20);
  assert.equal(fast.scrollSpeed, 180);
});

test("back to top stops scrolling and emits a new synchronized top command", () => {
  const running = { ...baseState, scrolling: true, scrollTopSequence: 4 };
  const top = applyTeleprompterAction(running, { type: "scrollTop" }, "remote:test", 2);

  assert.equal(top.scrolling, false);
  assert.equal(top.scrollTopSequence, 5);
});
