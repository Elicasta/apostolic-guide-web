import assert from "node:assert/strict";
import test from "node:test";
import { allPathways } from "../src/pathway-catalog";
import { getPathwayKjvPassage, pathwayKjvPassages } from "../src/pathway-kjv";

function expectedVerseCount(reference: string) {
  const match = reference.match(/\d+:(\d+)(?:[–—-](\d+))?$/);
  assert.ok(match, `Unsupported pathway reference: ${reference}`);
  const start = Number(match[1]);
  const end = Number(match[2] ?? match[1]);
  return end - start + 1;
}

test("every pathway step includes its complete local KJV passage", () => {
  const usedReferences = new Set<string>();

  for (const pathway of allPathways) {
    for (const step of pathway.steps) {
      usedReferences.add(step.reference);
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

  assert.deepEqual(
    new Set(Object.keys(pathwayKjvPassages)),
    usedReferences,
    "Local KJV data should match the pathway reference set exactly"
  );
});

test("every pathway passage has intentional red-bold emphasis that exists in its own text", () => {
  for (const passage of Object.values(pathwayKjvPassages)) {
    assert.ok(passage.emphasis.length > 0, `${passage.reference} has no emphasis phrases`);
    const text = passage.verses.map((verse) => verse.text).join(" ").toLowerCase();

    for (const phrase of passage.emphasis) {
      assert.ok(
        text.includes(phrase.toLowerCase()),
        `${passage.reference} emphasis phrase is not present in KJV text: ${phrase}`
      );
    }
  }
});
