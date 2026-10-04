import assert from "node:assert/strict";
import test from "node:test";
import { allPathways } from "../src/pathway-catalog";
import { getPathwayKjvPassage, pathwayKjvPassages } from "../src/pathway-kjv";
import { hasPathwayKjvEmphasis } from "../src/pathway-kjv-emphasis";

function expectedVerseCount(reference: string) {
  const match = reference.match(/\d+:(\d+)(?:[–—-](\d+))?$/);
  assert.ok(match, `Unsupported pathway reference: ${reference}`);
  const start = Number(match[1]);
  const end = Number(match[2] ?? match[1]);
  return end - start + 1;
}

test("every pathway step includes its complete local KJV passage", () => {
  for (const pathway of allPathways) {
    for (const step of pathway.steps) {
      const passage = getPathwayKjvPassage(step.reference);
      assert.ok(passage, `Missing KJV passage for ${step.reference}`);
      assert.equal(passage.translation, "KJV");
      assert.equal(
        passage.verses.length,
        expectedVerseCount(step.reference),
        `${step.reference} does not include every assigned verse`
      );

      for (const verse of passage.verses) {
        assert.ok(verse.text.trim().length > 0, `${step.reference} contains an empty verse`);
        assert.ok(!verse.text.includes("..."), `${step.reference} contains truncated text`);
        assert.ok(!verse.text.includes("…"), `${step.reference} contains truncated text`);
      }
    }
  }
});


test("every local pathway passage has at least one intentional emphasis target", () => {
  for (const passage of Object.values(pathwayKjvPassages)) {
    const text = passage.verses.map((verse) => verse.text).join(" ");
    assert.ok(hasPathwayKjvEmphasis(text), `${passage.reference} has no bold red emphasis target`);
  }
});
