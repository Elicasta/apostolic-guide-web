import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildEditorialGenerationPrompt,
  buildVideoProducerLicenseManifest,
  buildVideoProducerPremiereAssembly,
  compileVideoProducerVisualPlacements,
  videoProducerVisualFingerprintInput,
  visualBeatDirectionLooksLikeBibleMovie,
  visualPromptLooksLikeBibleMovie,
  type VideoProducerVisualAsset,
  type VideoProducerVisualBeat,
  type VideoProducerVisualPlacement
} from "../src/video-producer-visuals";

function beat(overrides: Partial<VideoProducerVisualBeat> = {}): VideoProducerVisualBeat {
  return {
    id: "beat-1",
    projectId: "project-1",
    sourceStart: 10,
    duration: 4,
    dialogue: "The Word was made flesh.",
    recommendation: "b-roll",
    intent: "Move from abstract Word language into tactile physicality.",
    searchQueries: ["archival paper macro", "ink on paper fibers"],
    vocabulary: "incarnation",
    preferredStyle: "documentary editorial macro photography",
    avoid: [],
    status: "open",
    source: "sol",
    revision: 1,
    ...overrides
  };
}

function placement(overrides: Partial<VideoProducerVisualPlacement> = {}): VideoProducerVisualPlacement {
  return {
    id: "placement-1",
    projectId: "project-1",
    beatId: "beat-1",
    assetId: "asset-1",
    sourceStart: 1,
    sourceEnd: 5,
    assetIn: 0,
    assetOut: 4,
    fit: "cover",
    positionX: 0.5,
    positionY: 0.5,
    scale: 1,
    layer: 2,
    audioEnabled: true,
    source: "auto",
    locked: false,
    revision: 1,
    ...overrides
  };
}

function asset(overrides: Partial<VideoProducerVisualAsset> = {}): VideoProducerVisualAsset {
  return {
    id: "asset-1",
    sourceProvider: "pexels",
    providerAssetId: "19238192",
    sourceUrl: "https://www.pexels.com/video/example/",
    creator: "Example Creator",
    licenseName: "Pexels License",
    licenseUrl: "https://www.pexels.com/license/",
    licenseSnapshot: "snapshot",
    retrievedAt: "2026-09-02T12:00:00.000Z",
    storageProvider: "vercel_blob",
    storageLocator: "video-producer/visuals/project-1/asset-1.mp4",
    filename: "bible_pages_002.mp4",
    mimeType: "video/mp4",
    sizeBytes: 1234,
    sha256: "abc123",
    duration: 8,
    width: 1920,
    height: 1080,
    fps: 30,
    tags: ["bible", "pages"],
    description: "Bible pages in natural light",
    reusable: true,
    rightsFlags: { thirdPartyRightsReviewRequired: true },
    revision: 1,
    ...overrides
  };
}

test("Bible-movie detector groups subject actions instead of matching generic words globally", () => {
  assert.equal(visualPromptLooksLikeBibleMovie("Dust gathered inside a quiet stone room."), false);
  assert.equal(visualPromptLooksLikeBibleMovie("Desert light falls across an archival map."), false);
  assert.equal(visualPromptLooksLikeBibleMovie("Apostles gathered beside a boat."), true);
  assert.equal(visualPromptLooksLikeBibleMovie("Ancient people walking through a desert."), true);
  assert.equal(visualPromptLooksLikeBibleMovie("Jesus standing on a mountain."), true);
});

test("generation safety checks affirmative visual direction, not automatic negative constraints", () => {
  const editorialBeat = beat();
  assert.equal(visualBeatDirectionLooksLikeBibleMovie(editorialBeat), false);
  const prompt = buildEditorialGenerationPrompt({ beat: editorialBeat, mode: "podcast" });
  assert.match(prompt, /actors portraying Jesus, Moses/i);
  assert.match(prompt, /visible generated text/i);

  const rejectedBeat = beat({
    intent: "Show Jesus standing on a mountain while the crowd watches.",
    searchQueries: ["Jesus mountain crowd"]
  });
  assert.equal(visualBeatDirectionLooksLikeBibleMovie(rejectedBeat), true);
});

test("Visual Pass placements stay silent, clamp transforms, and map through content cuts", () => {
  const [compiled] = compileVideoProducerVisualPlacements(
    [placement({ positionX: 2, positionY: -1, scale: 9, audioEnabled: true })],
    [{ id: "cut-1", start: 2, end: 4, reason: "dead air" }],
    10
  );
  assert.ok(compiled);
  assert.equal(compiled.audioEnabled, false);
  assert.equal(compiled.positionX, 1);
  assert.equal(compiled.positionY, 0);
  assert.equal(compiled.scale, 4);
  assert.deepEqual(compiled.outputRanges, [
    { sourceStart: 1, sourceEnd: 2, outputStart: 1, outputEnd: 2 },
    { sourceStart: 4, sourceEnd: 5, outputStart: 2, outputEnd: 3 }
  ]);
});

test("visual revisions and media hashes participate in approval fingerprint input", () => {
  const first = videoProducerVisualFingerprintInput({ placements: [placement()], assets: [asset()] });
  const revisedPlacement = videoProducerVisualFingerprintInput({ placements: [placement({ revision: 2 })], assets: [asset()] });
  const replacedMedia = videoProducerVisualFingerprintInput({ placements: [placement()], assets: [asset({ sha256: "different" })] });
  assert.notDeepEqual(first, revisedPlacement);
  assert.notDeepEqual(first, replacedMedia);
});

test("license and Premiere assembly exports preserve provenance and silent V2 placement", () => {
  const visualPlacement = placement({ audioEnabled: false });
  const visualAsset = asset();
  const licenses = buildVideoProducerLicenseManifest({ projectId: "project-1", placements: [visualPlacement], assets: [visualAsset] });
  assert.equal(licenses.length, 1);
  assert.equal(licenses[0].provider, "pexels");
  assert.equal(licenses[0].assetId, "19238192");
  assert.equal(licenses[0].sha256, "abc123");

  const assembly = buildVideoProducerPremiereAssembly({
    projectId: "project-1",
    placements: [visualPlacement],
    assets: [visualAsset],
    generatedAt: "2026-09-02T13:00:00.000Z"
  });
  assert.equal(assembly.bins.brollStock, "02_BROLL/STOCK");
  assert.equal(assembly.bins.brollAi, "02_BROLL/AI");
  assert.equal(assembly.placements[0].audioEnabled, false);
  assert.equal(assembly.placements[0].storageLocator, visualAsset.storageLocator);
});

test("stock reuse keys include the selected trim so one provider source can have multiple useful derivatives", () => {
  const route = readFileSync("app/api/admin/video-producer/visual-pass/use/route.ts", "utf8");
  assert.match(route, /function stockDerivativeId/);
  assert.match(route, /providerAssetId}@\$\{start\.toFixed\(3\)\}\+\$\{length\.toFixed\(3\)\}/);
  assert.match(route, /provider_asset_id: durableProviderAssetId/);
  assert.match(route, /originalProviderAssetId/);
  assert.match(route, /derivativeAssetId/);
});
