import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("app/admin/episode-studio/page.tsx", "utf8");
const audioRoute = readFileSync("app/api/admin/episode-studio/[episodeId]/audio/route.ts", "utf8");
const handoff = readFileSync("app/api/admin/video-producer/episodes/[episodeId]/export/route.ts", "utf8");
const mediaMigration = readFileSync("supabase/migrations/20260817024000_episode_studio_media_pipeline.sql", "utf8");
const growthMigration = readFileSync("supabase/migrations/20260829030000_episode_youtube_growth_system.sql", "utf8");
const generateRoute = readFileSync("app/api/admin/video-producer/episodes/[episodeId]/generate/route.ts", "utf8");
const updateRoute = readFileSync("app/api/admin/video-producer/episodes/[episodeId]/route.ts", "utf8");
const reviewRoute = readFileSync("app/api/admin/video-producer/episodes/[episodeId]/review/route.ts", "utf8");

test("Episode Studio exposes the dedicated admin app", () => {
  assert.match(page, /EpisodeStudioLane/);
  assert.match(page, /manage_content/);
});

test("Episode Studio persists a generated mastered audio artifact", () => {
  assert.match(mediaMigration, /audio_url text/);
  assert.match(mediaMigration, /audio_voice_map jsonb/);
  assert.match(audioRoute, /masterPathwayPcm16Mono/);
  assert.match(audioRoute, /pcm16MonoToWav/);
  assert.match(audioRoute, /audio_generated_at/);
});

test("Episode Studio persists growth plan, performance history, and learning on the episode source of truth", () => {
  assert.match(growthMigration, /growth_plan jsonb/);
  assert.match(growthMigration, /growth_metrics jsonb/);
  assert.match(growthMigration, /growth_learning jsonb/);
});

test("episode source edits invalidate approval before downstream production", () => {
  assert.match(updateRoute, /\["title", "premise", "primaryPathwaySlug", "supportingPathwaySlugs", "format", "speakers", "scriptText"\]/);
  assert.match(updateRoute, /patch.status = "draft"/);
  assert.match(updateRoute, /patch.theology_review = null/);
});

test("script generation and approval refuse to bypass the current package", () => {
  assert.match(generateRoute, /Build the YouTube package before generating the script/);
  assert.match(generateRoute, /episodeGrowthPlanMatchesSource/);
  assert.match(reviewRoute, /Build the YouTube package before theology review and approval/);
  assert.match(reviewRoute, /growthContentRevision/);
});

test("Episode video production cannot bypass the approved audio stage", () => {
  assert.match(handoff, /if \(!episode\.audio_url\)/);
  assert.match(handoff, /episodeAudioUrl: episode\.audio_url/);
});
