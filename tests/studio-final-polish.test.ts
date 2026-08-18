import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const carouselPage = readFileSync("app/admin/carousel-studio/page.tsx", "utf8");
const carouselRepair = readFileSync("src/carousel-live-repair.tsx", "utf8");
const carouselCss = readFileSync("app/admin/carousel-final-repair.css", "utf8");
const episodeExport = readFileSync("app/api/admin/video-producer/episodes/[episodeId]/export/route.ts", "utf8");
const articleRoute = readFileSync("app/api/admin/episode-studio/[episodeId]/article/route.ts", "utf8");
const episodePage = readFileSync("app/admin/episode-studio/page.tsx", "utf8");

test("Carousel Manual Edit has a post-render live repair and one offscreen render stage", () => {
  assert.match(carouselPage, /<CarouselLiveRepair\/>/);
  assert.match(carouselRepair, /--copy-align/);
  assert.match(carouselRepair, /copy\.style\.textAlign/);
  assert.match(carouselRepair, /alignItems/);
  assert.match(carouselCss, /left:-12000px/);
});

test("Episode video handoff carries the approved script into Video Producer", () => {
  assert.match(episodeExport, /transcript_text: script/);
  assert.match(episodeExport, /segments: \[\{ text: script, start: 0, end: duration \}\]/);
  assert.match(episodeExport, /source_provider: "episode-studio"/);
  assert.match(episodeExport, /recommendedStep: "produce"/);
});

test("Episode Studio can persist an article draft from the current episode script", () => {
  assert.match(articleRoute, /studio_episode_articles/);
  assert.match(articleRoute, /articleFromScript/);
  assert.match(episodePage, /<EpisodeDraftTools\/>/);
});
