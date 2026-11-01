import assert from "node:assert/strict";
import test from "node:test";
import { extractJsonObject, parsePathwayAssetEnrichment } from "../src/pathway-asset-enrichment";

test("extractJsonObject tolerates fenced JSON", () => {
  assert.deepEqual(extractJsonObject("```json\n{\"ok\":true}\n```"), { ok: true });
});

test("parsePathwayAssetEnrichment validates and normalizes tags", () => {
  const result = parsePathwayAssetEnrichment(JSON.stringify({
    suggestedTitle: "Jesus Is God editorial cover",
    description: "A restrained editorial visual for the Jesus Is God Pathway.",
    altText: "Dark blue editorial image with open negative space for Scripture typography.",
    tags: ["Jesus", "deity", "Jesus", "John 1"],
    confidence: 0.93
  }));

  assert.equal(result.suggestedTitle, "Jesus Is God editorial cover");
  assert.deepEqual(result.tags, ["Jesus", "deity", "John 1"]);
  assert.equal(result.confidence, 0.93);
});

test("parsePathwayAssetEnrichment rejects weak payloads", () => {
  assert.throws(() => parsePathwayAssetEnrichment('{"suggestedTitle":"x"}'));
});
