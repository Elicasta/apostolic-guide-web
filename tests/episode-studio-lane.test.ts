import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const lane = readFileSync("src/episode-studio-lane.tsx", "utf8");
const nav = readFileSync("src/studio-nav.tsx", "utf8");
const palette = readFileSync("src/studio-command-palette.tsx", "utf8");
const legacy = readFileSync("app/admin/video-producer/episodes/page.tsx", "utf8");
const videoHandoff = readFileSync("app/api/admin/video-producer/episodes/[episodeId]/export/route.ts", "utf8");
const packageRoute = readFileSync("app/api/admin/video-producer/episodes/[episodeId]/package/route.ts", "utf8");
const performanceRoute = readFileSync("app/api/admin/video-producer/episodes/[episodeId]/performance/route.ts", "utf8");

test("Episode Studio is a dedicated Package to Learn lane", () => {
  assert.match(nav, /href: "\/admin\/episode-studio"/);
  assert.match(palette, /label: "Episode Studio"/);
  for (const stage of ["Package", "Script", "Audio", "Video", "Publish", "Learn"]) assert.match(lane, new RegExp(`label: "${stage}"`));
  assert.match(lane, /Build YouTube package/);
  assert.match(lane, /Generate script/);
  assert.match(lane, /Generate audio/);
  assert.match(lane, /Create video project/);
  assert.match(lane, /Open in Publishing/);
  assert.match(lane, /projectId=/);
  assert.match(lane, /pathwaySlug=/);
  assert.match(lane, /Save performance \+ learn/);
});

test("package is persisted before script generation and can select title or thumbnail without rebuilding strategy", () => {
  assert.match(packageRoute, /growth_plan: plan/);
  assert.match(packageRoute, /selectEpisodeGrowthPackage/);
  assert.match(packageRoute, /episodeGrowthSourceFingerprint/);
  assert.match(lane, /packageReady/);
});

test("Episode video handoff requires the approved generated audio and carries the growth plan", () => {
  assert.match(videoHandoff, /if \(!episode\.audio_url\)/);
  assert.match(videoHandoff, /episodeAudioUrl: episode\.audio_url/);
  assert.match(videoHandoff, /episodeGrowthPlan: growthPlan/);
  assert.match(videoHandoff, /youtubePackage:/);
});

test("post-publish performance compares episodes through the shared learning engine", () => {
  assert.match(performanceRoute, /baselineFrom/);
  assert.match(performanceRoute, /evaluateYoutubeGrowthLearning/);
  assert.match(performanceRoute, /growth_learning: learning/);
});

test("legacy Video Producer Episodes route redirects into Episode Studio", () => {
  assert.match(legacy, /redirect\("\/admin\/episode-studio"\)/);
});
