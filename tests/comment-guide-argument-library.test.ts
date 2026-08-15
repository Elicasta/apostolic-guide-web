import assert from "node:assert/strict";
import test from "node:test";
import {
  COMMENT_GUIDE_ARGUMENT_CATEGORIES,
  COMMENT_GUIDE_ARGUMENT_LIBRARY,
  buildArgumentGuidedFallbackReply,
  matchCommentGuideArguments,
  mergeCommentGuideArgumentIds,
  preferredPathwayForArguments
} from "../src/comment-guide-argument-library";
import { validatePublicCommentReply } from "../src/comment-guide";
import { pathwayBySlug } from "../src/pathway-catalog";

test("the objection library has unique IDs, covers every doctrine category, and only references live Pathways", () => {
  assert.equal(new Set(COMMENT_GUIDE_ARGUMENT_LIBRARY.map((argument) => argument.id)).size, COMMENT_GUIDE_ARGUMENT_LIBRARY.length);
  for (const category of COMMENT_GUIDE_ARGUMENT_CATEGORIES) {
    assert.ok(COMMENT_GUIDE_ARGUMENT_LIBRARY.some((argument) => argument.category === category), `missing ${category}`);
  }
  for (const argument of COMMENT_GUIDE_ARGUMENT_LIBRARY) {
    assert.ok(argument.patterns.length > 0, `${argument.id} has no patterns`);
    assert.ok(argument.calmCorrection.length > 40, `${argument.id} has no useful correction`);
    for (const slug of argument.pathwaySlugs) assert.ok(pathwayBySlug(slug), `${argument.id} references missing Pathway ${slug}`);
  }
});

test("combined claims keep the biblical claim, strawman, and accusation classifications together", () => {
  const matches = matchCommentGuideArguments("Jesus is not the Father. This is modalism and heresy.").map((argument) => argument.id);
  assert.deepEqual(matches, ["jesus-not-the-father", "modalism-masks-or-modes", "heresy-cult-not-christian"]);
  assert.equal(preferredPathwayForArguments(matches), "father-dwells-in-son");
});

test("the original production accusation is classified instead of disappearing", () => {
  const matches = matchCommentGuideArguments("this modalism heresy you are leading people astray").map((argument) => argument.id);
  assert.deepEqual(matches, ["modalism-masks-or-modes", "heresy-cult-not-christian"]);
});

test("the three-person Trinity objection from the decision log receives a specific library match", () => {
  const matches = matchCommentGuideArguments("God is one in three persons! We cannot deny the Trinity!").map((argument) => argument.id);
  assert.ok(matches.includes("three-persons-one-god"));
  assert.equal(preferredPathwayForArguments(matches), "god-is-one");
});

test("the library recognizes arguments across baptism, salvation, tongues, Spirit reception, and history", () => {
  const fixtures: Array<[string, string]> = [
    ["Matthew 28:19 says baptize in the name of the Father, Son and Holy Spirit", "matthew-28-baptismal-formula"],
    ["The thief on the cross was saved without baptism", "thief-on-the-cross"],
    ["Christ sent Paul not to baptize according to 1 Corinthians 1:17", "paul-not-sent-to-baptize"],
    ["Do all speak with tongues? 1 Corinthians 12:30", "not-all-speak-with-tongues"],
    ["Every believer already has the Holy Spirit", "spirit-received-at-belief"],
    ["Oneness was invented in 1913", "invented-in-1913"]
  ];
  for (const [comment, expected] of fixtures) {
    assert.ok(matchCommentGuideArguments(comment).some((argument) => argument.id === expected), `${expected} did not match`);
  }
});

test("deterministic matches are retained when Sol adds a valid paraphrase and invented IDs are dropped", () => {
  assert.deepEqual(
    mergeCommentGuideArgumentIds("Jesus prayed to the Father", ["john-17-preexistent-glory", "made-up-argument"]),
    ["jesus-prayed-to-the-father", "john-17-preexistent-glory"]
  );
});

test("server-owned multi-claim replies remain cordial, doctrine-safe, and varied", () => {
  const input = {
    argumentIds: ["jesus-not-the-father", "modalism-masks-or-modes", "heresy-cult-not-christian"],
    pathwayTitle: "The Father Dwells in the Son",
    intent: "doctrinal_objection" as const,
    seed: "comment-one"
  };
  const first = buildArgumentGuidedFallbackReply(input);
  const second = buildArgumentGuidedFallbackReply({ ...input, recentReplies: [first] });
  assert.notEqual(second, first);
  assert.match(first, /Father-Son distinction|distinguish the Father from the Son/i);
  assert.match(first, /mask|roles/i);
  assert.doesNotMatch(first, /thank you for raising|i understand the concern/i);
  for (const reply of [first, second]) {
    assert.ok(reply.length <= 500);
    assert.equal(validatePublicCommentReply({
      reply,
      intent: "doctrinal_objection",
      pathwaySlug: "father-dwells-in-son",
      scriptureReferences: []
    }), null);
  }
});
