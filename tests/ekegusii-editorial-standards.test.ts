import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { allPathways } from "../src/pathway-catalog";
import { ekegusiiReviewStatus, EKEGUSII_PATHWAY_REVIEW, getEkegusiiSourceCoverage, ekegusiiPathwayCheck } from "../src/ekegusii-editorial-standards";

test("all 106 steps have Scripture links and all 20 Pathways have doctrinal guardrails", () => {
  assert.deepEqual(Object.keys(EKEGUSII_PATHWAY_REVIEW).sort(), allPathways.map(p=>p.slug).sort());
  const coverage = getEkegusiiSourceCoverage();
  assert.equal(coverage.pathways, 20);
  assert.equal(coverage.steps, 106);
  assert.equal(coverage.linksUnmapped, 0);
  assert.ok(coverage.bibleTextInspectedSteps >= 12 && coverage.bibleTextInspectedSteps < 106);
  for (const pathway of allPathways) {
    const check = ekegusiiPathwayCheck(pathway.slug);
    assert.ok(check?.preserve.length > 30);
    assert.ok(check?.avoid.length > 30);
    for (const step of pathway.steps) {
      const status = ekegusiiReviewStatus(step.reference);
      assert.equal(status.bibleEdition, "Ebibilia Enchenu © 2021 Bible Society of Kenya");
      assert.equal(status.translationHumanApproved, false);
      assert.equal(status.doctrineHumanApproved, false);
      assert.ok(status.hasChapterLink);
    }
  }
});
test("only actually inspected publisher verses get the source-inspected label", () => {
  assert.equal(ekegusiiReviewStatus("John 1:14").bibleTextInspected, true);
  assert.equal(ekegusiiReviewStatus("Matthew 1:23").bibleTextInspected, true);
  assert.equal(ekegusiiReviewStatus("Genesis 1:1").bibleTextInspected, true);
  assert.equal(ekegusiiReviewStatus("Luke 1:35").bibleTextInspected, true);
  assert.equal(ekegusiiReviewStatus("Psalm 118:16").bibleTextInspected, true);
  assert.equal(ekegusiiReviewStatus("Hebrews 1:3").bibleTextInspected, true);
  assert.equal(ekegusiiReviewStatus("Romans 1:5").bibleTextInspected, true);
  assert.equal(ekegusiiReviewStatus("2 Corinthians 7:10").bibleTextInspected, true);
  assert.equal(ekegusiiReviewStatus("Acts 2:38").bibleTextInspected, false);
  assert.equal(ekegusiiReviewStatus("Isaiah 43:10").bibleTextInspected, false);
  const body = readFileSync("src/ekegusii-edition.tsx","utf8");
  assert.match(body, /sourceReview\.bibleTextInspected/);
  assert.match(body, /Original English teaching · doctrinal baseline/);
  assert.match(body, /Doctrinal and translation checks for this Pathway/);
  assert.match(body, /Do not introduce:/);
  assert.match(body, /Source inspected/);
});
test("rights remain source-linked, without reproducing full verses",()=>{
  const source = readFileSync("src/ekegusii-editorial-standards.ts","utf8");
  assert.match(source, /INSPECTED_SCRIPTURE/);
  assert.match(source, /translationHumanApproved: false/);
  assert.doesNotMatch(source, /\\v\s*1|\\c\s*1/);
});
