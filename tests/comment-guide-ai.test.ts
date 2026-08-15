import assert from "node:assert/strict";
import test from "node:test";
import {
  containsDirectCommentAbuse,
  enforceDoctrinalResponsePolicy,
  prepareInstagramCommentDecision
} from "../src/comment-guide-ai";
import type { CommentGuideDecision } from "../src/comment-guide";

function ignoredDecision(overrides: Partial<CommentGuideDecision> = {}): CommentGuideDecision {
  return {
    intent: "doctrinal_objection",
    action: "ignore",
    confidence: 0.97,
    contentionLevel: "skeptical",
    automationId: null,
    matchedKeyword: null,
    pathwaySlug: "god-is-one",
    publicReply: null,
    scriptureReferences: [],
    argumentIds: [],
    internalReason: "The comment is confrontational.",
    ...overrides
  };
}

test("forceful accusations cannot make a recognized doctrinal objection stay ignored", () => {
  const comment = "This is straight up heresy. God is a trinity, you are teaching modalism. The trinity is in the Bible and taught by the church fathers.";
  const decision = enforceDoctrinalResponsePolicy(comment, ignoredDecision({
    argumentIds: ["modalism-masks-or-modes", "heresy-cult-not-christian", "nicaea-and-church-history", "three-persons-one-god"]
  }));
  assert.equal(decision.intent, "doctrinal_objection");
  assert.equal(decision.action, "answer_once");
  assert.equal(decision.pathwaySlug, "god-is-one");
  assert.deepEqual(new Set(decision.argumentIds), new Set([
    "three-persons-one-god",
    "modalism-masks-or-modes",
    "heresy-cult-not-christian",
    "nicaea-and-church-history"
  ]));
});

test("a non-abusive doctrinal accusation misclassified as hostile becomes a one-time redirect", () => {
  const comment = "This is modalism and heresy. The church fathers rejected it.";
  const decision = enforceDoctrinalResponsePolicy(comment, ignoredDecision({
    intent: "hostile_abuse",
    contentionLevel: "abusive",
    pathwaySlug: null,
    argumentIds: ["modalism-masks-or-modes", "heresy-cult-not-christian", "nicaea-and-church-history"]
  }));
  assert.equal(containsDirectCommentAbuse(comment), false);
  assert.equal(decision.intent, "gotcha_contention");
  assert.equal(decision.action, "redirect_once");
  assert.equal(decision.pathwaySlug, "god-is-one");
});

test("direct personal abuse still remains ignored", () => {
  const comment = "You are a stupid liar. This is heresy.";
  const decision = enforceDoctrinalResponsePolicy(comment, ignoredDecision({
    intent: "hostile_abuse",
    contentionLevel: "abusive",
    pathwaySlug: null,
    argumentIds: ["heresy-cult-not-christian"]
  }));
  assert.equal(containsDirectCommentAbuse(comment), true);
  assert.equal(decision.intent, "hostile_abuse");
  assert.equal(decision.action, "ignore");
  assert.deepEqual(decision.argumentIds, []);
});

test("the server supplies a Pathway answer when Sol classifies doctrine but returns ignore with no draft", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.OPENAI_API_KEY;
  const originalModel = process.env.OPENAI_COMMENT_GUIDE_MODEL;
  process.env.OPENAI_API_KEY = "test-key";
  delete process.env.OPENAI_COMMENT_GUIDE_MODEL;
  const modelDecision = ignoredDecision({
    confidence: 0.2,
    argumentIds: ["modalism-masks-or-modes", "heresy-cult-not-christian", "nicaea-and-church-history", "three-persons-one-god"]
  });
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ output_text: JSON.stringify(modelDecision) }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  try {
    const result = await prepareInstagramCommentDecision({
      comment: "This is straight up heresy. God is a trinity, you are teaching modalism. The trinity is in the Bible and taught by the church fathers.",
      senderId: "test-sender",
      externalEventId: "test-confrontation-policy",
      explicitAutomation: null,
      recentReplies: []
    });
    assert.equal(calls, 1);
    assert.equal(result.prepared.action, "answer_once");
    assert.equal(result.prepared.pathwaySlug, "god-is-one");
    assert.ok(result.prepared.publicReply);
    assert.ok(result.prepared.privateReply);
    assert.ok(result.prepared.delaySeconds > 0);
    assert.match(result.prepared.internalReason, /server-written safe fallback/i);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalApiKey;
    if (originalModel === undefined) delete process.env.OPENAI_COMMENT_GUIDE_MODEL;
    else process.env.OPENAI_COMMENT_GUIDE_MODEL = originalModel;
  }
});
