import assert from "node:assert/strict";
import test from "node:test";
import { assetMetadataString, collectPathwayAssetDeleteIds } from "../src/pathway-asset-delete";

test("collectPathwayAssetDeleteIds deletes a root and every nested descendant", () => {
  const ids = collectPathwayAssetDeleteIds("root", [
    { id: "root", parent_asset_id: null },
    { id: "child-a", parent_asset_id: "root" },
    { id: "child-b", parent_asset_id: "root" },
    { id: "grandchild", parent_asset_id: "child-a" },
    { id: "other-root", parent_asset_id: null }
  ]);

  assert.deepEqual(new Set(ids), new Set(["root", "child-a", "child-b", "grandchild"]));
});

test("collectPathwayAssetDeleteIds deleting a child preserves siblings and ancestors", () => {
  const ids = collectPathwayAssetDeleteIds("child-a", [
    { id: "root", parent_asset_id: null },
    { id: "child-a", parent_asset_id: "root" },
    { id: "child-b", parent_asset_id: "root" },
    { id: "grandchild", parent_asset_id: "child-a" }
  ]);

  assert.deepEqual(new Set(ids), new Set(["child-a", "grandchild"]));
});

test("collectPathwayAssetDeleteIds is cycle safe", () => {
  const ids = collectPathwayAssetDeleteIds("a", [
    { id: "a", parent_asset_id: "c" },
    { id: "b", parent_asset_id: "a" },
    { id: "c", parent_asset_id: "b" }
  ]);

  assert.deepEqual(new Set(ids), new Set(["a", "b", "c"]));
});

test("assetMetadataString only returns non-empty string metadata", () => {
  assert.equal(assetMetadataString({ renderId: " abc " }, "renderId"), "abc");
  assert.equal(assetMetadataString({ renderId: 42 }, "renderId"), null);
  assert.equal(assetMetadataString({ renderId: "   " }, "renderId"), null);
  assert.equal(assetMetadataString(null, "renderId"), null);
});
