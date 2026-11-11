import assert from "node:assert/strict";
import test from "node:test";
import { getPersonalChannelSeedDocuments } from "../src/lib/teleprompter/personal";
import {
  getSeedDocuments,
  mergePersonalChannelSeeds,
} from "../src/lib/teleprompter/seeded-storage";
import { parseTeleprompterDocument } from "../src/lib/teleprompter/parser";
import type { TeleprompterDocument } from "../src/lib/teleprompter/types";

const [teaching, life] = getPersonalChannelSeedDocuments();

test("personal channel has two uniquely named episodes, distinct from Apostolic Guide", () => {
  assert.deepEqual(
    [teaching.id, life.id],
    ["eli-castaneda-episode-01", "eli-castaneda-episode-02"],
  );
  assert.match(teaching.title, /I Am Eli Castaneda.*Know God/);
  assert.match(life.title, /I Am Eli Castaneda.*Building a Life/);
  const allSeeds = getSeedDocuments();
  assert.equal(new Set(allSeeds.map((doc) => doc.id)).size, allSeeds.length);
  assert.ok(allSeeds.some((doc) => doc.id === "apostolic-guide-episode-01"));
  assert.ok(allSeeds.some((doc) => doc.id === "apostolic-guide-episode-12"));
});

test("each personal episode has nine full navigable sections and presenter notes", () => {
  for (const episode of [teaching, life]) {
    const slides = parseTeleprompterDocument(episode.content);
    assert.equal(slides.length, 9, episode.title);
    assert.ok(slides.every((slide) => slide.heading?.length && slide.note?.length));
    assert.ok(episode.content.length > 5000, "ship the complete conversational script, not short cues");
    assert.ok(slides[0].heading?.startsWith("Opening"));
    assert.ok(slides[8].heading?.startsWith("Closing"));
  }
  assert.ok(parseTeleprompterDocument(teaching.content).filter((slide) => slide.reference).length >= 5);
  assert.equal(parseTeleprompterDocument(life.content).filter((slide) => slide.reference).length, 0);
});

test("new personal episodes prepend while preserving older scripts and any user edits", () => {
  const existing: TeleprompterDocument = {
    id: "my-script",
    title: "My script",
    content: "# Do not overwrite",
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-11-10T00:00:00.000Z",
  };
  const merged = mergePersonalChannelSeeds([existing]);
  assert.deepEqual(merged.slice(0, 2).map((doc) => doc.id), [teaching.id, life.id]);
  assert.deepEqual(merged[2], existing);

  const customTeaching = { ...teaching, content: "# User-edited script", updatedAt: "2026-11-12T00:00:00.000Z" };
  const rerun = mergePersonalChannelSeeds([customTeaching, life, existing]);
  assert.equal(rerun.length, 3);
  assert.deepEqual(rerun[0], customTeaching);
  assert.deepEqual(rerun[1], life);
  assert.deepEqual(rerun[2], existing);
});

test("merging an empty or partial personal library cannot create duplicate IDs", () => {
  const merged = mergePersonalChannelSeeds([]);
  assert.equal(merged.length, 2);
  assert.deepEqual(mergePersonalChannelSeeds(merged), merged);
  const partial = mergePersonalChannelSeeds([teaching]);
  assert.deepEqual(partial.map((doc) => doc.id), [life.id, teaching.id]);
});
