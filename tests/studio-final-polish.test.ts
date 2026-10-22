import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const episodeExport = readFileSync("app/api/admin/video-producer/episodes/[episodeId]/export/route.ts", "utf8");
const articleRoute = readFileSync("app/api/admin/episode-studio/[episodeId]/article/route.ts", "utf8");
const episodePage = readFileSync("app/admin/episode-studio/page.tsx", "utf8");

test("Carousel Manual Edit has a post-render live repair and one offscreen render stage", () => {
  const client = readFileSync("src/creative-studio-client.tsx", "utf8");
  assert.match(client, /<CarouselDesignPanel/);
  assert.match(client, /frameDesigns/);
  assert.match(client, /<CarouselBackgroundPanel/);
  assert.doesNotMatch(client, /MutationObserver|createPortal|cloneNode/);
});

test("Episode video handoff carries spoken copy, word timing, and a renderable source into Video Producer", () => {
  assert.match(episodeExport, /wavDurationSeconds/);
  assert.match(episodeExport, /const words = tokens\.map/);
  assert.match(episodeExport, /transcript_text: transcript\.text/);
  assert.match(episodeExport, /source_provider: "vercel_blob"/);
  assert.match(episodeExport, /video-producer\/sources\/episodes/);
  assert.match(episodeExport, /recommendedStep: "produce"/);
});

test("Episode Studio can persist an article draft from the current episode script", () => {
  assert.match(articleRoute, /studio_episode_articles/);
  assert.match(articleRoute, /articleFromScript/);
  assert.match(episodePage, /<EpisodeDraftTools\/>/);
});
