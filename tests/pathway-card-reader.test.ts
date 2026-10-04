import assert from "node:assert/strict";
import test from "node:test";
import { pathwayBySlug } from "../src/pathway-catalog";

test("God Is One is authored as a guided card study", () => {
  const pathway = pathwayBySlug("god-is-one");
  assert.ok(pathway);
  assert.equal(pathway.steps.length, 5);

  for (const [index, step] of pathway.steps.entries()) {
    assert.ok(step.explanation.length >= 180, `step ${index + 1} explanation is too thin for guided study`);
    assert.ok(step.hook && step.hook.length >= 70, `step ${index + 1} needs a transition hook`);
  }

  assert.equal(pathway.steps[0].reference, "Deuteronomy 6:4");
  assert.equal(pathway.steps.at(-1)?.reference, "1 Corinthians 8:4");
});
