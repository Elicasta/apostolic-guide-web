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
  scrollSpeed: 55,
  scrollTopSequence: 0,
  scrollNudgeSequence: 0,
  scrollNudgeDelta: 0,
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
    scrollNudgeSequence: undefined,
    scrollNudgeDelta: undefined,
  };

  assert.equal(isTeleprompterSessionState(legacy), true);
  const normalized = normalizeTeleprompterState(legacy as unknown as TeleprompterSessionState);
  assert.equal(normalized.scrolling, false);
  assert.equal(normalized.scrollSpeed, 55);
  assert.equal(normalized.scrollTopSequence, 0);
  assert.equal(normalized.scrollNudgeSequence, 0);
  assert.equal(normalized.scrollNudgeDelta, 0);
});

test("slide navigation automatically stops auto-scroll", () => {
  const running = { ...baseState, scrolling: true };
  const next = applyTeleprompterAction(running, { type: "next" }, "remote:test", 2);

  assert.equal(next.slideIndex, 1);
  assert.equal(next.scrolling, false);
});

test("scroll speed supports the useful range between 50 and 60", () => {
  const tuned = applyTeleprompterAction(baseState, { type: "scrollSpeed", scrollSpeed: 55 }, "remote:test", 2);
  assert.equal(tuned.scrollSpeed, 55);
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

test("remote page nudge stops auto-scroll and emits a signed page-position command", () => {
  const running = { ...baseState, scrolling: true, scrollNudgeSequence: 7 };
  const down = applyTeleprompterAction(running, { type: "scrollNudge", delta: 110 }, "remote:test", 2);
  const up = applyTeleprompterAction(down, { type: "scrollNudge", delta: -110 }, "remote:test", 3);

  assert.equal(down.scrolling, false);
  assert.equal(down.scrollNudgeSequence, 8);
  assert.equal(down.scrollNudgeDelta, 110);
  assert.equal(up.scrollNudgeSequence, 9);
  assert.equal(up.scrollNudgeDelta, -110);
});
