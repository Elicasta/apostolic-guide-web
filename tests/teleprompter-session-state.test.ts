import assert from "node:assert/strict";
import test from "node:test";
import {
  applyCanonicalDeck,
  applyTeleprompterAction,
  isTeleprompterSessionState,
  shouldAcceptTeleprompterState,
} from "../src/lib/teleprompter/session-state";
import type { TeleprompterSessionState } from "../src/lib/teleprompter/types";

function session(slideCount = 9): TeleprompterSessionState {
  return {
    title: "Jesus Is God",
    documentId: "jesus-is-god",
    slideIndex: 0,
    theme: "night",
    mode: "script",
    fontScale: 1,
    locked: false,
    scrolling: false,
    scrollSpeed: 55,
    scrollTopSequence: 0,
    slides: Array.from({ length: slideCount }, (_, index) => ({
      id: `section-${index + 1}`,
      heading: `Section ${index + 1}`,
      preview: `Section ${index + 1}`,
    })),
    sequence: 1,
    updatedAt: 100,
    actorId: "remote:test",
  };
}

test("authoritative next state advances through all nine sections and clamps at the end", () => {
  let current = session();
  for (let index = 0; index < 12; index += 1) {
    current = applyTeleprompterAction(current, { type: "next" }, "remote:test", 101 + index);
  }
  assert.equal(current.slideIndex, 8);
  assert.equal(current.slides.length, 9);
  assert.equal(current.sequence, 13);
});

test("stale and out-of-order snapshots cannot move a screen backward", () => {
  const current = { ...session(), sequence: 8, updatedAt: 800 };
  assert.equal(
    shouldAcceptTeleprompterState(current, { ...current, sequence: 7, updatedAt: 900 }),
    false,
  );
  assert.equal(
    shouldAcceptTeleprompterState(current, { ...current, sequence: 9, updatedAt: 700 }),
    true,
  );
});

test("timestamp and actor id deterministically resolve equal sequence snapshots", () => {
  const current = { ...session(), sequence: 4, updatedAt: 400, actorId: "display:aaaa" };
  assert.equal(
    shouldAcceptTeleprompterState(current, { ...current, updatedAt: 401 }),
    true,
  );
  assert.equal(
    shouldAcceptTeleprompterState(current, { ...current, actorId: "display:zzzz" }),
    true,
  );
});

test("the display upgrades an old two-page snapshot to its canonical nine-page deck", () => {
  const oldRemoteState = { ...session(2), slideIndex: 1, sequence: 20 };
  const upgraded = applyCanonicalDeck(oldRemoteState, session(9));
  assert.equal(upgraded.slides.length, 9);
  assert.equal(upgraded.slideIndex, 1);
  assert.equal(upgraded.sequence, 20);
});

test("invalid or legacy command-shaped payloads are rejected", () => {
  assert.equal(isTeleprompterSessionState({ type: "next" }), false);
  assert.equal(isTeleprompterSessionState({ ...session(), sequence: -1 }), false);
  assert.equal(isTeleprompterSessionState({ ...session(), slides: [] }), false);
});
