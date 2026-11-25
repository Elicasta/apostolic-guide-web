import { test } from "node:test";
import assert from "node:assert/strict";
import { manualNavigationForKey, resolveScrollNudge, LINE_NUDGE, PAGE_NUDGE } from "../src/lib/teleprompter/manual-navigation";
import { applyTeleprompterAction } from "../src/lib/teleprompter/session-state";
import type { TeleprompterSessionState } from "../src/lib/teleprompter/types";

test("presentation clickers cue sections without skipping on held keys", () => {
  for (const key of ["ArrowRight", "PageDown"]) {
    assert.deepEqual(manualNavigationForKey(key), { type: "next" });
    assert.equal(manualNavigationForKey(key, true), null);
  }
  for (const key of ["ArrowLeft", "PageUp"]) {
    assert.deepEqual(manualNavigationForKey(key), { type: "prev" });
    assert.equal(manualNavigationForKey(key, true), null);
  }
  assert.deepEqual(manualNavigationForKey("ArrowDown", true), { type: "scrollNudge", delta: LINE_NUDGE });
  assert.deepEqual(manualNavigationForKey("ArrowUp"), { type: "scrollNudge", delta: -LINE_NUDGE });
  assert.equal(manualNavigationForKey("Enter"), null);
});

test("manual page steps overlap on all display sizes and ordinary nudges retain their size", () => {
  assert.equal(resolveScrollNudge(PAGE_NUDGE, 600), 390);
  assert.equal(resolveScrollNudge(-PAGE_NUDGE, 400), -260);
  assert.equal(resolveScrollNudge(PAGE_NUDGE, 1), 1);
  assert.equal(resolveScrollNudge(LINE_NUDGE, 600), LINE_NUDGE);
  assert.equal(resolveScrollNudge(-LINE_NUDGE, 600), -LINE_NUDGE);
});

test("manual page scroll and next section both stop auto-scroll", () => {
  const state: TeleprompterSessionState = {
    title: "Test", slideIndex: 0, theme: "night", mode: "script", fontScale: 1,
    locked: false, scrolling: true, scrollSpeed: 55, scrollTopSequence: 0,
    slides: [{ id: "1", preview: "First" }, { id: "2", preview: "Second" }],
    sequence: 0, updatedAt: 0, actorId: "display:test",
  };
  const page = applyTeleprompterAction(state, { type: "scrollNudge", delta: PAGE_NUDGE }, "remote:test", 1);
  assert.equal(page.scrolling, false);
  assert.equal(page.scrollNudgeDelta, PAGE_NUDGE);
  assert.equal(page.slideIndex, 0);
  const next = applyTeleprompterAction(state, { type: "next" }, "remote:test", 1);
  assert.equal(next.scrolling, false);
  assert.equal(next.slideIndex, 1);
});
