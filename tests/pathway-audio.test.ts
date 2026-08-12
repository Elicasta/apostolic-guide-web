import assert from "node:assert/strict";
import test from "node:test";
import { allPathways } from "../src/pathway-catalog";
import { buildPathwayNarration, pathwayNarrationHash } from "../src/pathway-audio";

test("every pathway produces TTS-safe narration", () => {
  for (const pathway of allPathways) {
    const narration = buildPathwayNarration(pathway);
    assert.ok(narration.length > 100, `${pathway.slug} narration is unexpectedly short`);
    assert.ok(narration.length <= 4096, `${pathway.slug} narration exceeds the speech endpoint input limit: ${narration.length}`);
    assert.ok(narration.includes(pathway.title), `${pathway.slug} narration is missing its title`);
    for (const step of pathway.steps) {
      assert.ok(narration.includes(step.reference), `${pathway.slug} narration is missing ${step.reference}`);
    }
  }
});

test("pathway narration hashes are deterministic and distinct", () => {
  const hashes = allPathways.map((pathway) => {
    const first = pathwayNarrationHash(pathway);
    const second = pathwayNarrationHash(pathway);
    assert.equal(first, second, `${pathway.slug} hash changed without content changes`);
    assert.match(first, /^[a-f0-9]{64}$/);
    return first;
  });
  assert.equal(new Set(hashes).size, hashes.length, "Two pathway narrations produced the same content hash");
});
