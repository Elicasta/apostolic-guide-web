import assert from "node:assert/strict";
import test from "node:test";
import {
  humanPathwayAssetBytes,
  PATHWAY_ASSET_MAX_UPLOAD_BYTES,
  PATHWAY_ASSET_STORAGE_PROVIDER,
  pathwayAssetClientFingerprint,
  pathwayAssetIngestStudio,
  pathwayAssetIngestType,
  pathwayAssetMediaKind,
  sanitizePathwayAssetFilename
} from "../src/pathway-asset-ingest";

test("ingest classifies supported media into durable source asset types", () => {
  assert.equal(pathwayAssetMediaKind("image/jpeg"), "image");
  assert.equal(pathwayAssetIngestType("video/mp4"), "uploaded-video");
  assert.equal(pathwayAssetIngestType("audio/wav"), "source-audio");
  assert.equal(pathwayAssetIngestType("application/pdf"), "source-document");
  assert.equal(pathwayAssetIngestType("application/zip"), "source-archive");
});

test("video and audio auto-route to the video production lane", () => {
  assert.equal(pathwayAssetIngestStudio("video/mp4", "carousel"), "video");
  assert.equal(pathwayAssetIngestStudio("audio/mpeg", "carousel"), "video");
  assert.equal(pathwayAssetIngestStudio("image/png", "carousel"), "carousel");
});

test("storage filenames remain readable while removing unsafe path characters", () => {
  assert.equal(sanitizePathwayAssetFilename("  Jesús Is God / FINAL v2!.MOV  "), "Jesus-Is-God-FINAL-v2.mov");
  assert.equal(sanitizePathwayAssetFilename("../../bad name.zip"), "bad-name.zip");
});

test("client fingerprints are stable for the same browser file identity", () => {
  const input = { name: "Master.mp4", size: 1234, lastModified: 99, mimeType: "video/mp4" };
  assert.equal(pathwayAssetClientFingerprint(input), pathwayAssetClientFingerprint(input));
});

test("Vercel Blob is the source-master provider with a 20 GB application ceiling", () => {
  assert.equal(PATHWAY_ASSET_STORAGE_PROVIDER, "vercel_blob");
  assert.equal(PATHWAY_ASSET_MAX_UPLOAD_BYTES, 20 * 1024 * 1024 * 1024);
});

test("human byte labels scale through gigabytes", () => {
  assert.equal(humanPathwayAssetBytes(1024), "1.00 KB");
  assert.equal(humanPathwayAssetBytes(1024 * 1024 * 1024), "1.00 GB");
  assert.equal(humanPathwayAssetBytes(20 * 1024 * 1024 * 1024), "20.0 GB");
});
