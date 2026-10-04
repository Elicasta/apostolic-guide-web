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


test("every pathway step has an authored transition", () => {
  for (const pathway of allPathways) {
    assert.ok(pathway.steps.length >= 2, `${pathway.slug} must contain a study sequence`);
    for (const [index, step] of pathway.steps.entries()) {
      assert.ok(step.hook, `${pathway.slug} step ${index + 1} is missing a transition`);
      assert.ok(step.hook!.length >= 70, `${pathway.slug} step ${index + 1} transition is too thin`);
      assert.ok(!step.hook!.startsWith("Now carry that question"), `${pathway.slug} step ${index + 1} is using fallback copy`);
    }
  }
});
