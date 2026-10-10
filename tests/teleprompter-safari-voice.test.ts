import assert from "node:assert/strict";
import test from "node:test";
import { parseTeleprompterDocument } from "../src/lib/teleprompter/parser";
import { createVoiceDeck, deckCursorForPosition, findDeckPosition, spokenSlideLines } from "../src/lib/teleprompter/voice-deck";
import { applyTeleprompterAction, isTeleprompterSessionState } from "../src/lib/teleprompter/session-state";
import type { TeleprompterSessionState } from "../src/lib/teleprompter/types";

const sample = parseTeleprompterDocument(`# The One God
He is the only God.
> Beside him there is no other.
@ref Isaiah 45:5
@note This private cue must not be spoken.
---
# Jesus is God
The fullness of the Godhead dwells bodily in Jesus Christ.`);
test("spoken text excludes section headings and private speaker notes", () => {
  assert.deepEqual(spokenSlideLines(sample[0]), [
    "He is the only God.", "Beside him there is no other.",
  ]);
});
test("voice cursor crosses chapter boundary and maps to the right section", () => {
  const deck = createVoiceDeck(sample);
  assert.equal(deck.ranges.length, 2);
  assert.equal(findDeckPosition(deck, 0).slideIndex, 0);
  assert.equal(findDeckPosition(deck, deck.ranges[1].start).slideIndex, 1);
  assert.deepEqual(findDeckPosition(deck, deck.ranges[1].start + 2), { slideIndex: 1, wordIndex: 2 });
  assert.equal(deckCursorForPosition(deck, 1, 2), deck.ranges[1].start + 2);
  assert.equal(deck.words.includes("isaiah"), false);
  assert.equal(deck.words.includes("cue"), false);
});
const state: TeleprompterSessionState = {
  title: "Sample", documentId: "sample", slideIndex: 0, mode: "script", theme: "night",
  fontScale: 1, locked: false, scrolling: false, scrollSpeed: 55,
  scrollTopSequence: 0, slides: sample.map((s, i) => ({ id: s.id, preview: s.heading ?? String(i) })),
  sequence: 1, updatedAt: 123, actorId: "display:test",
};
test("voice position is accepted by session validator and does not start timed scrolling", () => {
  const followed = applyTeleprompterAction(state, { type: "voiceFollow", slideIndex: 1, wordIndex: 5, mode: "following" }, "remote:mic", 200);
  assert.equal(isTeleprompterSessionState(followed), true);
  assert.equal(followed.voiceActive, true);
  assert.equal(followed.voiceWordIndex, 5);
  assert.equal(followed.slideIndex, 1);
  assert.equal(followed.scrolling, false);
  const stopped = applyTeleprompterAction(followed, { type: "voiceStop" }, "remote:mic", 250);
  assert.equal(stopped.voiceActive, false);
  assert.equal(stopped.voiceMode, "paused");
});
test("manual section jump or timed scroll cancels voice-follow", () => {
  const followed = applyTeleprompterAction(state, { type: "voiceFollow", slideIndex: 1, wordIndex: 5, mode: "following" }, "remote:mic", 200);
  const manual = applyTeleprompterAction(followed, { type: "prev" }, "display:test", 201);
  assert.equal(manual.voiceActive, false);
  assert.equal(manual.slideIndex, 0);
  const timed = applyTeleprompterAction(followed, { type: "scroll", scrolling: true }, "display:test", 202);
  assert.equal(timed.voiceActive, false);
});
