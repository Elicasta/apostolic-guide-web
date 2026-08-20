import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSolManagerInventory,
  classifySolManagerPathway,
  filterSolManagerInventory,
  type SolManagerPathwayEvidence
} from "../src/sol-manager-engine";

const canonical = { slug: "god-is-one", title: "God Is One", sourceHash: "source-v2" };

function evidence(overrides: Partial<SolManagerPathwayEvidence> = {}): SolManagerPathwayEvidence {
  return {
    audioUrl: "https://cdn.example/audio.wav",
    audioContentHash: "script-v2",
    scriptSourceHash: "source-v2",
    scriptHash: "script-v2",
    scriptStatus: "approved",
    checkerStatus: "passed",
    checkedScriptHash: "script-v2",
    videoProjectReady: true,
    youtubePublished: false,
    carouselAssets: 1,
    carouselPublished: 0,
    automationLinked: true,
    ...overrides
  };
}

test("audio only counts ready when source, approval, doctrine, and hashes all agree", () => {
  const row = classifySolManagerPathway(canonical, evidence());
  assert.equal(row.audio.state, "ready");
  assert.equal(row.audio.scriptCurrent, true);
  assert.equal(row.audio.theologyPassed, true);
  assert.equal(row.audio.audioMatchesScript, true);
});

test("an existing audio file becomes stale when the canonical Pathway changes", () => {
  const row = classifySolManagerPathway(canonical, evidence({ scriptSourceHash: "source-v1" }));
  assert.equal(row.audio.state, "stale");
  assert.equal(row.audio.scriptCurrent, false);
});

test("missing audio with an approved current script is immediately generatable", () => {
  const row = classifySolManagerPathway(canonical, evidence({ audioUrl: null, audioContentHash: null }));
  assert.equal(row.audio.state, "missing");
});

test("missing audio with no approved current script is blocked instead of falsely counted ready-to-render", () => {
  const row = classifySolManagerPathway(canonical, evidence({
    audioUrl: null,
    audioContentHash: null,
    scriptStatus: "draft"
  }));
  assert.equal(row.audio.state, "blocked");
});

test("inventory totals and asset filters are deterministic", () => {
  const evidenceBySlug = new Map([
    ["god-is-one", evidence()],
    ["jesus-is-god", evidence({ audioUrl: null, audioContentHash: null, scriptStatus: "draft", videoProjectReady: false, carouselAssets: 0, automationLinked: false })]
  ]);
  const inventory = buildSolManagerInventory({
    pathways: [
      canonical,
      { slug: "jesus-is-god", title: "Jesus Is God", sourceHash: "source-v2" }
    ],
    evidenceBySlug
  });
  assert.deepEqual(inventory.totals.audio, { desired: 2, ready: 1, missing: 0, stale: 0, blocked: 1 });
  assert.deepEqual(inventory.totals.carousel, { desired: 2, published: 0, staged: 1, missing: 1 });
  assert.deepEqual(inventory.totals.automation, { desired: 2, linked: 1, missing: 1 });
  assert.deepEqual(filterSolManagerInventory(inventory, "audio", "jesus-is-god"), [
    { slug: "jesus-is-god", title: "Jesus Is God", audio: inventory.pathways[1].audio }
  ]);
});
