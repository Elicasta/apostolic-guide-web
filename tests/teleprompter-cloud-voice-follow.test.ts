import assert from "node:assert/strict";
import test from "node:test";
import {
  documentFingerprint,
  mergeCloudLibrary,
  type CloudTeleprompterDocument,
} from "../src/lib/teleprompter/cloud-storage";
import {
  advanceVoiceFollow,
  detectScriptureReference,
  findVoiceMatch,
  finishVoiceFollow,
  initialVoiceFollowState,
  tokenizeSpeech,
} from "../src/lib/teleprompter/voice-follow";
import type { TeleprompterDocument } from "../src/lib/teleprompter/types";

const local: TeleprompterDocument = {
  id: "script-a", title: "Jesus Is God", content: "An edited local copy",
  createdAt: "2026-10-08T00:00:00Z", updatedAt: "2026-10-09T00:00:00Z",
};
const remote: CloudTeleprompterDocument = {
  id: "script-a", title: "Jesus Is God", content: "A different cloud copy",
  revision: 4, created_at: "2026-10-08T00:00:00Z", updated_at: "2026-10-09T01:00:00Z",
};
test("cloud library migration retains new local documents", () => {
  const other = { ...local, id: "local-only" };
  const result = mergeCloudLibrary([other], [remote], {});
  assert.equal(result.recoveryCount, 0);
  assert.equal(result.localOnly.length, 1);
  assert.deepEqual(result.documents.map(doc => doc.id), ["script-a", "local-only"]);
});
test("cloud library migration never destroys unknown local edits", () => {
  const result = mergeCloudLibrary([local], [remote], {});
  assert.equal(result.recoveryCount, 1);
  assert.equal(result.documents.length, 2);
  assert.equal(result.documents[0].content, local.content);
  assert.match(result.documents[0].title, /local recovery/);
  assert.equal(result.documents[1].content, remote.content);
});
test("cloud library migration treats exact synced document as one copy", () => {
  const synced = { ...local, content: remote.content };
  const result = mergeCloudLibrary([synced], [remote], {
    "script-a": { revision: 4, fingerprint: documentFingerprint(synced) },
  });
  assert.equal(result.recoveryCount, 0);
  assert.equal(result.documents.length, 1);
});
test("voice tokenizer handles punctuation, accents, and Scripture", () => {
  assert.deepEqual(tokenizeSpeech("Gód's fullness, John 14:9!"), ["god", "s", "fullness", "john", "14", "9"]);
  assert.equal(detectScriptureReference("Go to John chapter 14 verse 9"), "John chapter 14 verse 9");
});
test("voice alignment anchors spoken phrases and refuses unrelated speech", () => {
  const script = tokenizeSpeech("There is one God and beside him there is none other. The fullness of the Godhead dwells bodily in Jesus.");
  assert.ok(findVoiceMatch("there is one God and beside him", script, 0));
  assert.equal(findVoiceMatch("Let me tell you a story about Florida", script, 0), null);
});
test("silence freezes cursor, improvisation stays in notes, then reacquires", () => {
  const script = tokenizeSpeech("There is one God and beside him there is none other. The fullness of the Godhead dwells bodily in Jesus.");
  let state = initialVoiceFollowState();
  state = advanceVoiceFollow(state, { transcript: "there is one God and beside him", final: true, speaking: true, at: 100 }, script);
  assert.equal(state.mode, "following");
  const position = state.cursorWord;
  state = advanceVoiceFollow(state, { transcript: "", final: false, speaking: false, at: 300 }, script);
  assert.equal(state.mode, "paused");
  assert.equal(state.cursorWord, position);
  state = advanceVoiceFollow(state, { transcript: "Go to John chapter 14 verse 9", final: true, speaking: true, at: 500 }, script);
  assert.equal(state.mode, "paused");
  assert.equal(state.pendingUnmatched.length, 1);
  assert.equal(state.cursorWord, position);
  state = advanceVoiceFollow(state, { transcript: "And that is important to understand", final: true, speaking: true, at: 520 }, script);
  assert.equal(state.mode, "improvising");
  assert.equal(state.cursorWord, position);
  state = advanceVoiceFollow(state, { transcript: "", final: false, speaking: false, at: 560 }, script);
  assert.equal(state.mode, "paused");
  assert.equal(state.improvisation.length, 2);
  state = advanceVoiceFollow(state, { transcript: "the fullness of the Godhead", final: false, speaking: true, at: 600 }, script);
  // A long exact Safari interim result should reacquire immediately, without
  // waiting through multiple finalized phrases while the presenter continues.
  assert.equal(state.mode, "following");
  assert.ok(state.cursorWord > position);
  assert.equal(state.completedNotes.length, 1);
  assert.match(state.completedNotes[0].text, /John chapter 14/);
  assert.equal(state.completedNotes[0].reference, "John chapter 14 verse 9");
});
test("stopping voice capture preserves unfinished improvisation", () => {
  const script = tokenizeSpeech("There is one God and beside him there is none other");
  let state = advanceVoiceFollow(initialVoiceFollowState(), {
    transcript: "This is an important unscripted explanation", final: true, speaking: true, at: 500,
  }, script);
  state = advanceVoiceFollow(state, {
    transcript: "Here is another paragraph that is not scripted", final: true, speaking: true, at: 600,
  }, script);
  state = finishVoiceFollow(state, 1000);
  assert.equal(state.mode, "paused");
  assert.equal(state.completedNotes.length, 1);
  assert.match(state.completedNotes[0].text, /This is an important unscripted explanation/);
  assert.match(state.completedNotes[0].text, /Here is another paragraph/);
});

test("short recognized fragments do not falsely trigger improvisation", () => {
  const script = tokenizeSpeech("There is one God and beside him there is none other");
  let state = advanceVoiceFollow(initialVoiceFollowState(), {
    transcript: "there is one God", final: true, speaking: true, at: 100,
  }, script);
  state = advanceVoiceFollow(state, {
    transcript: "um well", final: true, speaking: true, at: 250,
  }, script);
  assert.equal(state.mode, "following");
  assert.equal(state.improvisation.length, 0);
});
test("a short two-word recognition can move the cursor when adjacent", () => {
  const script = tokenizeSpeech("There is one God and beside him there is none other");
  let state = advanceVoiceFollow(initialVoiceFollowState(), {
    transcript: "there is one God", final: true, speaking: true, at: 100,
  }, script);
  const prior = state.cursorWord;
  state = advanceVoiceFollow(state, {
    transcript: "and beside", final: false, speaking: true, at: 180,
  }, script);
  assert.equal(state.mode, "following");
  assert.ok(state.cursorWord > prior);
});

test("natural pause is Waiting, not Holding, even after a misrecognized final", () => {
  const script = tokenizeSpeech("Before we ask who Jesus is we need to establish who God says He is");
  let state = advanceVoiceFollow(initialVoiceFollowState(), {
    transcript: "Before we ask who Jesus is", final: true, speaking: true, at: 100,
  }, script);
  const place = state.cursorWord;
  state = advanceVoiceFollow(state, {
    transcript: "some disconnected recognized words", final: true, speaking: true, at: 300,
  }, script);
  assert.equal(state.mode, "following");
  assert.equal(state.improvisation.length, 0);
  assert.equal(state.pendingUnmatched.length, 1);
  state = advanceVoiceFollow(state, { transcript: "", speaking: false, final: false, at: 1800 }, script);
  assert.equal(state.mode, "paused");
  assert.equal(state.cursorWord, place);
  assert.equal(state.pendingUnmatched.length, 0);
  state = advanceVoiceFollow(state, {
    transcript: "we need to establish who God says", final: false, speaking: true, at: 2000,
  }, script);
  assert.equal(state.mode, "following");
  assert.ok(state.cursorWord > place);
  assert.equal(state.completedNotes.length, 0);
});

test("single unmatched final at beginning doesn't trigger false improvisation", () => {
  const script = tokenizeSpeech("There is one God and beside him there is no other");
  let state = advanceVoiceFollow(initialVoiceFollowState(), {
    transcript: "There was something in the middle of the sentence", final: true, speaking: true, at: 100,
  }, script);
  assert.equal(state.mode, "paused");
  assert.equal(state.pendingUnmatched.length, 1);
  state = advanceVoiceFollow(state, { transcript: "", final: false, speaking: false, at: 1600 }, script);
  assert.equal(state.mode, "paused");
  state = advanceVoiceFollow(state, { transcript: "there is one God and beside him", final: true, speaking: true, at: 2000 }, script);
  assert.equal(state.mode, "following");
  assert.equal(state.completedNotes.length, 0);
});

test("duplicate recognition result never counts as a second off-script utterance", () => {
  const script = tokenizeSpeech("There is one God and beside him there is no other");
  let state = advanceVoiceFollow(initialVoiceFollowState(), {
    transcript: "An unrelated phrase that Safari recognized", final: true, speaking: true, at: 100,
  }, script);
  state = advanceVoiceFollow(state, {
    transcript: "An unrelated phrase that Safari recognized", final: true, speaking: true, at: 200,
  }, script);
  assert.equal(state.pendingUnmatched.length, 1);
  assert.equal(state.improvisation.length, 0);
  assert.equal(state.mode, "paused");
});
