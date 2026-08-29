import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeVideoProducerGraphicAssetAttributes,
  serializeVideoProducerGraphicAsset,
  videoProducerGraphicAssetPersistence
} from "../src/video-producer-graphic-assets";

test("graphics uploader attributes survive validation, persistence, and library serialization", () => {
  const attributes = normalizeVideoProducerGraphicAssetAttributes({
    assetType: "scripture-frame",
    formats: ["podcast", "reels"],
    textBehavior: "fixed",
    maxLines: 3,
    alignment: "center",
    referenceZone: "safe-center",
    displayBehavior: "full-screen",
    fixedText: "JESUS IS GOD",
    notes: "Use for the opening claim; navy variant."
  });
  const persisted = videoProducerGraphicAssetPersistence(attributes);
  const asset = serializeVideoProducerGraphicAsset({
    id: "asset-1",
    title: "Jesus Is God",
    ...persisted,
    storage_provider: "vercel_blob",
    storage_locator: "video-producer/graphics/asset-1/jesus.webp",
    filename: "jesus.webp",
    content_type: "image/webp",
    size_bytes: 2048,
    tags: ["navy", "claim"],
    active: true,
    created_at: "2026-08-29T00:00:00.000Z",
    updated_at: "2026-08-29T00:00:00.000Z"
  }, "https://signed.example/jesus.webp");

  assert.deepEqual({
    assetType: asset.assetType,
    formats: asset.formats,
    textBehavior: asset.textBehavior,
    maxLines: asset.maxLines,
    alignment: asset.alignment,
    referenceZone: asset.referenceZone,
    displayBehavior: asset.displayBehavior,
    fixedText: asset.fixedText,
    notes: asset.notes
  }, attributes);
  assert.equal(asset.storageProvider, "vercel_blob");
  assert.equal(asset.storageLocator, "video-producer/graphics/asset-1/jesus.webp");
});

test("graphics uploader rejects invalid cross-field rules", () => {
  assert.throws(() => normalizeVideoProducerGraphicAssetAttributes({
    assetType: "statement",
    formats: [],
    textBehavior: "editable",
    maxLines: 2,
    alignment: "center",
    referenceZone: "safe-center",
    displayBehavior: "full-screen"
  }), /Choose Podcast/);

  assert.throws(() => normalizeVideoProducerGraphicAssetAttributes({
    assetType: "statement",
    formats: ["reels"],
    textBehavior: "fixed",
    maxLines: 2,
    alignment: "center",
    referenceZone: "safe-center",
    displayBehavior: "full-screen",
    fixedText: " "
  }), /exact baked-in text/);

  assert.throws(() => normalizeVideoProducerGraphicAssetAttributes({
    assetType: "statement",
    formats: ["podcast"],
    textBehavior: "editable",
    maxLines: 13,
    alignment: "center",
    referenceZone: "safe-center",
    displayBehavior: "full-screen"
  }), /1 to 12/);
});

test("no-text graphics discard incompatible line and fixed-text values", () => {
  const attributes = normalizeVideoProducerGraphicAssetAttributes({
    assetType: "texture",
    formats: ["podcast"],
    textBehavior: "none",
    maxLines: 7,
    alignment: "left",
    referenceZone: "full-frame",
    displayBehavior: "persistent",
    fixedText: "should not persist",
    notes: ""
  });
  assert.equal(attributes.maxLines, null);
  assert.equal(attributes.fixedText, null);
  assert.equal(attributes.notes, null);
});
