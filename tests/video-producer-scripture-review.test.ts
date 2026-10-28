import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import corpus from "../src/scripture-data/kjv.json";
import { readKjvPassage, type KjvCorpus } from "../src/kjv-reader";
import { correctScriptureOverlay, correctScriptureOverlays } from "../src/video-producer-scripture";
import { classifyVideoProducerIssue, type ProducerReviewIssue } from "../src/video-producer-doctrine-severity";
import { buildDefaultVideoProducerPlan, type VideoProducerOverlay } from "../src/video-producer";

function scripture(id: string, reference: string, title = "AI transcript paraphrase"): VideoProducerOverlay {
  return { id, kind: "scripture", start: 20, duration: 5, title, reference, placement: "lower-third" };
}
function issue(location: string, line: string, reason: string, reference: string): ProducerReviewIssue {
  return { severity: "fail", location, line, reason, reference };
}

test("new and existing scripture overlays use the exact bundled KJV words, never AI paraphrases", () => {
  for (const reference of ["Deuteronomy 6:4", "Isaiah 43:10", "Isaiah 44:8", "Mark 12:29", "1 Corinthians 8:4"]) {
    const corrected = correctScriptureOverlay(scripture("test", reference, "There is no other God but one."));
    const kjv = readKjvPassage(corpus as KjvCorpus, reference);
    assert.ok(kjv);
    assert.equal(corrected.title, kjv.verses.map((verse) => verse.text).join(" "));
    assert.equal(corrected.reference, reference);
    assert.equal(corrected.start, 20);
    assert.equal(corrected.body, undefined);
    if (corrected.title.length > 100) assert.equal(corrected.placement, "full-frame");
  }
  const plan = buildDefaultVideoProducerPlan("podcast", 260, [
    scripture("ai-overlay-3", "Deuteronomy 6:4", "The Lord our God, our God is one."),
    scripture("ai-overlay-11", "1 Corinthians 8:4", "There is no other God but one."),
    { id: "editorial", kind: "statement", title: "An original editorial statement", start: 0, duration: 3 }
  ]);
  const corrected = correctScriptureOverlays(plan);
  assert.equal(corrected.overlays[2].title, "An original editorial statement");
  assert.match(corrected.overlays[0].title, /^Hear, O Israel:/);
  assert.match(corrected.overlays[1].title, /there is none other God but one/i);
  assert.equal(plan.overlays[0].title, "The Lord our God, our God is one.");
});

test("unresolvable Scripture references fail closed, and ordinary overlays are not rewritten", () => {
  assert.throws(() => correctScriptureOverlay(scripture("bad", "Deuteronomy 999:1")), /invalid KJV reference/);
  assert.throws(() => correctScriptureOverlay({ ...scripture("missing", "John 1:1"), reference: undefined }), /needs a Bible reference/);
  const ordinary = { ...scripture("other", "Deuteronomy 6:4"), kind: "statement" as const };
  assert.deepEqual(correctScriptureOverlay(ordinary), ordinary);
});

test("the five IMG 2032 issues distinguish spoken wording from authored graphic quotations", () => {
  const cases = [
    issue("edit_overlays — Overlay 3", "The Lord our God, our God is one. | Deuteronomy 6:4",
      "Misquotes the verse by omitting Hear, O Israel.", "Deuteronomy 6:4"),
    issue("spoken_transcript", "Here, O Israel, the Lord our God, our God is one.",
      "Misquotes the KJV and incorrectly says Here rather than Hear.", "Deuteronomy 6:4"),
    issue("spoken_transcript", "Which commandment is the first of all?",
      "The attributed question does not match the KJV wording.", "Mark 12:28"),
    issue("edit_overlays — Overlay 11", "There is no other God but one. | 1 Corinthians 8:4",
      "Does not match the supplied KJV wording.", "1 Corinthians 8:4"),
    issue("spoken_transcript", "There is no other God but one.",
      "The quotation attributed to Paul omits none from the supplied KJV wording.", "1 Corinthians 8:4")
  ];
  assert.deepEqual(cases.map((entry) => classifyVideoProducerIssue(entry).severity),
    ["fail", "flag", "flag", "fail", "flag"]);
});

test("real doctrinal errors and fabricated citations stay hard FAIL even in speech", () => {
  const examples = [
    issue("spoken_transcript", "Jesus is not God.", "Misquotes a KJV verse.", "John 1:1"),
    issue("spoken_transcript", "God is not one.", "Does not match KJV wording.", "Deuteronomy 6:4"),
    issue("spoken_transcript", "An invented citation.", "Fabricated Scripture quotation.", "John 1:1"),
    issue("spoken_transcript", "A claim.", "Contradicts the Apostolic doctrine on Christ.", "Colossians 2:9"),
    issue("spoken_transcript", "A quote.", "Misquotes the KJV.", "")
  ];
  for (const example of examples) assert.equal(classifyVideoProducerIssue(example).severity, "fail");
  assert.equal(classifyVideoProducerIssue({ ...examples[0], severity: "flag" }).severity, "flag");
});

test("video-only source rules and original owner override and approval gate remain intact", () => {
  const gate = readFileSync("src/doctrine-gate.ts", "utf8");
  const approve = readFileSync("app/api/admin/video-producer/approve/route.ts", "utf8");
  const doctrine = readFileSync("app/api/admin/video-producer/doctrine-check/route.ts", "utf8");
  assert.match(gate, /source\.sourceType === "video_clip"/);
  assert.match(gate, /candidate\.issues\.map\(classifyVideoProducerIssue\)/);
  assert.match(gate, /on_screen_graphics.*KJV/);
  assert.match(approve, /assertDoctrineApproved/);
  assert.match(doctrine, /access\.role !== "owner"/);
  assert.match(doctrine, /recordStudioAudit/);
});

test("owner overlay edits reject stale or approved projects and require a new doctrine check", () => {
  const route = readFileSync("app/api/admin/video-producer/overlays/route.ts", "utf8");
  const flow = readFileSync("src/video-producer-sequential-flow.tsx", "utf8");
  const director = readFileSync("app/api/admin/video-producer/direct/route.ts", "utf8");
  assert.match(route, /access\.role !== "owner"/);
  assert.match(route, /\["draft", "planned"\]/);
  assert.match(route, /\.eq\("updated_at", input\.expectedUpdatedAt\)/);
  assert.match(route, /approval_fingerprint: null, approved_at: null/);
  assert.match(route, /recordStudioAudit/);
  assert.match(route, /correctScriptureOverlays\(plan\)/);
  assert.match(route, /doctrineState: "not_checked"/);
  assert.match(director, /correctScriptureOverlays\(directed\.plan\)/);
  assert.match(flow, /setDoctrineReady\(false\)/);
  assert.equal((flow.match(/<VideoProducerOverlayEditor /g) || []).length, 3);
  assert.match(flow, /<VideoProducerDoctrinePanel key=\{project\.id \+ ":" \+ project\.updated_at\}/);
  assert.doesNotMatch(route, /send-to-publisher|publish|renderMaster/);
});
