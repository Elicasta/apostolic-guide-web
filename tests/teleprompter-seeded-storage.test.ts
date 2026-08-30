import assert from "node:assert/strict";
import test from "node:test";
import { getEpisodeSeedDocuments } from "../src/lib/teleprompter/episodes";
import { mergeEpisodeSeeds } from "../src/lib/teleprompter/seeded-storage";
import type { TeleprompterDocument } from "../src/lib/teleprompter/types";

const existingDocument: TeleprompterDocument = {
  id: "custom-document",
  title: "My custom script",
  content: "# Custom\nDo not overwrite me.",
  createdAt: "2026-08-29T00:00:00.000Z",
  updatedAt: "2026-08-29T00:00:00.000Z",
};

test("Teleprompter seeds ship exactly Episodes 2 through 12 with stable unique IDs", () => {
  const seeds = getEpisodeSeedDocuments();
  const expectedIds = Array.from(
    { length: 11 },
    (_, index) => `apostolic-guide-episode-${String(index + 2).padStart(2, "0")}`,
  );

  assert.equal(seeds.length, 11);
  assert.deepEqual(
    seeds.map((seed) => seed.id),
    expectedIds,
  );
  assert.equal(new Set(seeds.map((seed) => seed.id)).size, 11);
});

test("Teleprompter seed merge preserves user documents and edited seeded episodes", () => {
  const seeds = getEpisodeSeedDocuments();
  const editedEpisodeTwo: TeleprompterDocument = {
    ...seeds[0],
    title: "My edited Episode 2",
    content: "User edit",
  };

  const merged = mergeEpisodeSeeds([existingDocument, editedEpisodeTwo], seeds);

  assert.equal(merged.length, 12);
  assert.deepEqual(merged[0], existingDocument);
  assert.deepEqual(merged[1], editedEpisodeTwo);
  assert.equal(
    merged.filter((document) => document.id === editedEpisodeTwo.id).length,
    1,
  );
});
