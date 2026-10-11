import assert from "node:assert/strict";
import test from "node:test";
import {
  assembleLocalBrollTimeline,
  localAssetWindow,
  provisionalVisualRange,
  rankLocalVisualLibrary,
  type LocalVisualRecord
} from "../src/video-producer-local-broll";
import type { VideoProducerVisualBeat } from "../src/video-producer-visuals";

function beat(overrides: Partial<VideoProducerVisualBeat> = {}): VideoProducerVisualBeat {
  return {
    id: "beat-paper",
    projectId: "local-proof",
    sourceStart: 2,
    duration: 2,
    dialogue: "The record was written down.",
    recommendation: "b-roll",
    intent: "Show archival paper under natural light.",
    searchQueries: ["archival paper macro"],
    vocabulary: "history",
    preferredStyle: "documentary editorial macro photography",
    avoid: [],
    status: "open",
    source: "sol",
    revision: 1,
    ...overrides
  };
}

function clip(overrides: Partial<LocalVisualRecord> = {}): LocalVisualRecord {
  return {
    id: "paper",
    filename: "archival-paper.mp4",
    description: "Archival paper fibers in natural light",
    tags: ["archival", "paper", "macro"],
    duration: 6,
    width: 640,
    height: 360,
    updatedAt: "2026-09-02T12:00:00.000Z",
    localPath: "/tmp/archival-paper.mp4",
    ...overrides
  };
}

test("local library ranking prefers the clip that matches more search terms", () => {
  const ranked = rankLocalVisualLibrary([
    clip({ id: "street", filename: "street.mp4", description: "City street", tags: ["crowd", "street"], localPath: "/tmp/street.mp4" }),
    clip({ id: "ink", filename: "ink.mp4", description: "Ink on paper fibers", tags: ["ink", "paper", "fibers"], localPath: "/tmp/ink.mp4" }),
    clip()
  ], ["archival paper macro"], 6);
  assert.equal(ranked[0]?.asset.id, "paper");
  assert.ok((ranked[0]?.matchedTerms ?? 0) > (ranked.find((row) => row.asset.id === "ink")?.matchedTerms ?? 0));
  assert.equal(ranked.some((row) => row.asset.id === "street"), false);
});

test("local timeline assembly places owned footage and leaves unmatched beats unresolved", () => {
  const library = [
    clip(),
    clip({ id: "ink", filename: "ink.mp4", description: "Ink on paper fibers", tags: ["ink", "paper", "fibers"], localPath: "/tmp/ink.mp4" }),
    clip({ id: "street", filename: "street.mp4", description: "City street", tags: ["crowd", "street"], localPath: "/tmp/street.mp4" })
  ];
  const assembled = assembleLocalBrollTimeline({
    projectId: "local-proof",
    sourceDuration: 8,
    library,
    beats: [
      beat(),
      beat({
        id: "beat-ink",
        sourceStart: 5.2,
        duration: 1.8,
        dialogue: "Ink still sits in the fibers.",
        intent: "Macro of ink drying in paper.",
        searchQueries: ["ink on paper fibers"]
      }),
      beat({
        id: "beat-none",
        sourceStart: 0.4,
        duration: 1,
        dialogue: "Nothing in the library matches this.",
        intent: "A glowing nebula inside a cathedral.",
        searchQueries: ["glowing nebula cathedral"]
      }),
      beat({
        id: "beat-bible-movie",
        sourceStart: 7,
        duration: 1,
        dialogue: "Do not stage this.",
        intent: "Show Jesus standing on a mountain.",
        searchQueries: ["Jesus mountain crowd"]
      })
    ]
  });

  assert.deepEqual(assembled.selections.map((selection) => [selection.beatId, selection.assetId]), [
    ["beat-paper", "paper"],
    ["beat-ink", "ink"]
  ]);
  assert.deepEqual(assembled.unresolvedBeatIds, ["beat-none", "beat-bible-movie"]);
  assert.ok(assembled.placements.every((placement) => placement.audioEnabled === false));
  const [first, second] = assembled.placements;
  assert.ok(first && second);
  assert.ok(second.sourceStart >= first.sourceEnd - 0.001);
  assert.ok(first.assetIn > 0, "a long local clip should trim in before the useful frames");
});

test("provisional ranges and trims stay inside the source and the local asset", () => {
  const range = provisionalVisualRange({ sourceStart: 10, duration: 12 }, 14);
  assert.equal(range.start, 9.65);
  assert.equal(range.duration, 4.35);
  const window = localAssetWindow(20, range.duration);
  assert.equal(window.assetIn, 2);
  assert.ok(window.assetOut <= 20);
  assert.ok(window.visible <= range.duration + 0.001);
});
