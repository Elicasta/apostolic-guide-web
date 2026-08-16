import assert from "node:assert/strict";
import test from "node:test";
import { assetSearchText, normalizeAssetTags, parseAssetTagInput } from "../src/pathway-asset-metadata";

test("normalizeAssetTags trims, deduplicates case-insensitively, and caps tags", () => {
  const tags = normalizeAssetTags([" Jesus ", "jesus", "Oneness", "  Bible   Study  ", 12, ""]);
  assert.deepEqual(tags, ["Jesus", "Oneness", "Bible Study"]);
});

test("parseAssetTagInput accepts a comma-delimited editor value", () => {
  assert.deepEqual(parseAssetTagInput("Jesus, deity, Jesus, John 1"), ["Jesus", "deity", "John 1"]);
});

test("assetSearchText indexes title, type, status, description, alt text, and tags", () => {
  const text = assetSearchText({
    title: "Jesus Is God cover",
    asset_type: "single-post",
    source_type: "generated",
    status: "approved",
    metadata: {
      description: "Editorial cover for the pathway",
      altText: "Blue and red Scripture graphic",
      tags: ["deity", "John 1"]
    }
  });

  for (const token of ["jesus is god", "single post", "approved", "editorial cover", "scripture graphic", "deity", "john 1"]) {
    assert.ok(text.includes(token), `expected search index to contain ${token}`);
  }
});
