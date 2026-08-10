import assert from "node:assert/strict";
import test from "node:test";
import { evaluateSegmentRuleSet } from "../src/segment-rules";

const members = new Map<string, Set<string>>([
  ["instagram", new Set(["p1", "p2"])],
  ["studying_7d", new Set(["p1", "p3"])],
  ["subscriber", new Set(["p2", "p3"])],
]);

test("custom segments support AND with exclusions", () => {
  const rules = [
    { segment_key: "instagram", negate: false },
    { segment_key: "studying_7d", negate: false },
    { segment_key: "subscriber", negate: true },
  ];
  assert.equal(evaluateSegmentRuleSet("p1", members, "all", rules), true);
  assert.equal(evaluateSegmentRuleSet("p2", members, "all", rules), false);
  assert.equal(evaluateSegmentRuleSet("p3", members, "all", rules), false);
});

test("custom segments support OR rules", () => {
  const rules = [
    { segment_key: "instagram", negate: false },
    { segment_key: "studying_7d", negate: false },
  ];
  assert.equal(evaluateSegmentRuleSet("p2", members, "any", rules), true);
  assert.equal(evaluateSegmentRuleSet("p3", members, "any", rules), true);
  assert.equal(evaluateSegmentRuleSet("p4", members, "any", rules), false);
});

test("empty custom rule sets never match", () => {
  assert.equal(evaluateSegmentRuleSet("p1", members, "all", []), false);
});
