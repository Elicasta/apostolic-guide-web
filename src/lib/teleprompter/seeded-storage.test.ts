import { describe, expect, it } from "vitest";
import { getEpisodeSeedDocuments } from "./episodes";
import { mergeEpisodeSeeds } from "./seeded-storage";
import type { TeleprompterDocument } from "./types";

const existingDocument: TeleprompterDocument = {
  id: "custom-document",
  title: "My custom script",
  content: "# Custom\nDo not overwrite me.",
  createdAt: "2026-08-29T00:00:00.000Z",
  updatedAt: "2026-08-29T00:00:00.000Z",
};

describe("Teleprompter episode seeds", () => {
  it("ships exactly Episodes 2 through 11 with stable unique IDs", () => {
    const seeds = getEpisodeSeedDocuments();

    expect(seeds).toHaveLength(10);
    expect(seeds.map((seed) => seed.id)).toEqual(
      Array.from({ length: 10 }, (_, index) =>
        `apostolic-guide-episode-${String(index + 2).padStart(2, "0")}`,
      ),
    );
    expect(new Set(seeds.map((seed) => seed.id)).size).toBe(10);
  });

  it("preserves user documents and only appends missing seeded episodes", () => {
    const seeds = getEpisodeSeedDocuments();
    const editedEpisodeTwo = {
      ...seeds[0],
      title: "My edited Episode 2",
      content: "User edit",
    };

    const merged = mergeEpisodeSeeds([existingDocument, editedEpisodeTwo], seeds);

    expect(merged).toHaveLength(11);
    expect(merged[0]).toEqual(existingDocument);
    expect(merged[1]).toEqual(editedEpisodeTwo);
    expect(merged.filter((document) => document.id === editedEpisodeTwo.id)).toHaveLength(1);
  });
});
