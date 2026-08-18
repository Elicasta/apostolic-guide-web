import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("app/admin/episode-studio/page.tsx", "utf8");
const audioRoute = readFileSync("app/api/admin/episode-studio/[episodeId]/audio/route.ts", "utf8");
const handoff = readFileSync("app/api/admin/video-producer/episodes/[episodeId]/export/route.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260817024000_episode_studio_media_pipeline.sql", "utf8");

test("Episode Studio exposes the dedicated admin app", () => {
  assert.match(page, /EpisodeStudioLane/);
  assert.match(page, /manage_content/);
});

test("Episode Studio persists a generated mastered audio artifact", () => {
  assert.match(migration, /audio_url text/);
  assert.match(migration, /audio_voice_map jsonb/);
  assert.match(audioRoute, /masterPathwayPcm16Mono/);
  assert.match(audioRoute, /pcm16MonoToWav/);
  assert.match(audioRoute, /audio_generated_at/);
});

test("Episode video production cannot bypass the approved audio stage", () => {
  assert.match(handoff, /if \(!episode\.audio_url\)/);
  assert.match(handoff, /episodeAudioUrl: episode\.audio_url/);
});
