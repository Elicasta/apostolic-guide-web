import assert from "node:assert/strict";
import test from "node:test";
import { buildPathwayAssetRestorePatch } from "../src/pathway-asset-versioning";

test("restore applies creative fields but never rewinds identity or creation metadata", () => {
  const patch = buildPathwayAssetRestorePatch({
    snapshot: {
      id: "old-id",
      pathway_slug: "wrong-pathway",
      created_at: "2000-01-01T00:00:00.000Z",
      created_by: "old-user",
      title: "Historical title",
      status: "approved",
      content: { slides: [{ title: "Old slide" }] },
      metadata: { tags: ["old"] },
      storage_path: "pathways/example/old.png"
    },
    currentVersion: 7,
    userId: "current-user",
    updatedAt: "2026-08-16T05:00:00.000Z"
  });

  assert.equal(patch.title, "Historical title");
  assert.equal(patch.status, "approved");
  assert.deepEqual(patch.content, { slides: [{ title: "Old slide" }] });
  assert.equal(patch.storage_path, "pathways/example/old.png");
  assert.equal(patch.version, 8);
  assert.equal(patch.updated_by, "current-user");
  assert.equal(patch.updated_at, "2026-08-16T05:00:00.000Z");
  assert.equal("id" in patch, false);
  assert.equal("pathway_slug" in patch, false);
  assert.equal("created_at" in patch, false);
  assert.equal("created_by" in patch, false);
});
