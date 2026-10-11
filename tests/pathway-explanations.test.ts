import assert from "node:assert/strict";
import test from "node:test";
import { allPathways, pathwayBySlug } from "../src/pathway-catalog";

function wordCount(value: string) {
  return value.trim().split(/\s+/u).filter(Boolean).length;
}

test("every Pathway has meaningful Scripture-grounded What This Shows teaching", () => {
  assert.ok(allPathways.length >= 20, "An existing Pathway disappeared from the catalog");

  const slugs = new Set<string>();
  let reviewedSteps = 0;
  for (const pathway of allPathways) {
    assert.ok(!slugs.has(pathway.slug), `Duplicate pathway: ${pathway.slug}`);
    slugs.add(pathway.slug);
    assert.ok(pathway.steps.length >= 5, `${pathway.slug}: expected a complete study sequence`);
    const references = new Set<string>();
    for (const step of pathway.steps) {
      const location = `${pathway.slug} / ${step.reference}`;
      assert.ok(step.title.trim().length > 0, `${location}: missing step title`);
      assert.ok(step.reference.trim().length > 0, `${location}: missing Scripture reference`);
      assert.ok(!references.has(step.reference), `${location}: duplicate reference within the pathway`);
      references.add(step.reference);

      const teaching = step.explanation?.trim() ?? "";
      assert.ok(
        wordCount(teaching) >= 55,
        `${location}: What This Shows needs a contextual explanation, not a one-line claim (${wordCount(teaching)} words)`
      );
      assert.ok(
        wordCount(teaching) <= 135,
        `${location}: the teaching is too long for a single mobile reading card`
      );
      assert.ok(
        teaching.includes(".") && !teaching.includes("..."),
        `${location}: finish the explanation; do not use placeholder copy`
      );
      assert.ok(step.hook?.trim(), `${location}: the next-step reasoning was lost`);
      reviewedSteps += 1;
    }
  }
  assert.ok(reviewedSteps >= 106, `Expected every existing study step; found ${reviewedSteps}`);
});

test("sensitive doctrinal explanations use the surrounding passage, not an isolated proof-text", () => {
  const jesus = pathwayBySlug("jesus-is-god");
  const john = jesus?.steps.find((step) => step.reference === "John 1:1")?.explanation ?? "";
  assert.match(john, /with God/i);
  assert.match(john, /was God/i);
  assert.match(john, /verse 14/i);

  const commission = pathwayBySlug("matthew-28-and-acts-2");
  const matthew = commission?.steps.find((step) => step.reference === "Matthew 28:19")?.explanation ?? "";
  assert.match(matthew, /singular/i);
  assert.match(matthew, /grammar alone does not/i);

  const tongues = pathwayBySlug("tongues-as-initial-sign");
  const corinthians = tongues?.steps.find((step) => step.reference === "1 Corinthians 12:30")?.explanation ?? "";
  assert.match(corinthians, /interpretation/i);
  assert.match(corinthians, /Paul/i);
});
