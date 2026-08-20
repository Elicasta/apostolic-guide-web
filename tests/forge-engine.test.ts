import assert from "node:assert/strict";
import test from "node:test";
import { buildForgeQueue, selectForgeBatch, summarizeForgeQueue, type ForgePathwayState } from "../src/forge-engine";

function pathway(overrides: Partial<ForgePathwayState> = {}): ForgePathwayState {
  return {
    slug: "god-is-one",
    title: "God Is One",
    campaignRank: 0,
    audioReady: false,
    audioStale: false,
    audioBlocked: true,
    carouselProjects: 0,
    carouselPublished: 0,
    youtubePublished: false,
    videoProjectReady: false,
    activeRecipes: [],
    ...overrides
  };
}

test("Forge builds separate production tasks instead of one vague backlog item", () => {
  const queue = buildForgeQueue([pathway()]);
  assert.deepEqual(queue.map((item) => item.lane).sort(), ["audio", "carousel"]);
  assert.equal(queue.some((item) => item.recipeKey === "forge_carousel_stage"), true);
  assert.equal(queue.some((item) => item.recipeKey === "pathway_audio_stage"), true);
});

test("Forge only offers YouTube after exact audio is ready", () => {
  const blocked = buildForgeQueue([pathway({ audioReady: false, audioBlocked: true, carouselProjects: 1 })]);
  assert.equal(blocked.some((item) => item.lane === "youtube"), false);

  const ready = buildForgeQueue([pathway({ audioReady: true, audioBlocked: false, carouselProjects: 1 })]);
  assert.equal(ready.some((item) => item.lane === "youtube"), true);
});

test("Forge suppresses duplicate lanes when a current recipe already owns the Pathway", () => {
  const queue = buildForgeQueue([pathway({
    audioReady: true,
    audioBlocked: false,
    activeRecipes: ["forge_carousel_stage", "audio_to_youtube"]
  })]);
  assert.equal(queue.some((item) => item.lane === "carousel"), false);
  assert.equal(queue.some((item) => item.lane === "youtube"), false);
});

test("Forge prioritizes active campaign work and bounds each batch", () => {
  const queue = buildForgeQueue([
    pathway({ slug: "low", title: "Low", campaignRank: 3, carouselProjects: 0, audioBlocked: false, audioReady: true, youtubePublished: true }),
    pathway({ slug: "high", title: "High", campaignRank: 0, carouselProjects: 0, audioBlocked: false, audioReady: true, youtubePublished: true })
  ]);
  assert.equal(queue[0]?.pathwaySlug, "high");
  assert.deepEqual(selectForgeBatch(queue, { lane: "carousel", limit: 1 }).map((item) => item.pathwaySlug), ["high"]);
});

test("Forge summary reports lane counts deterministically", () => {
  const queue = buildForgeQueue([pathway()]);
  assert.deepEqual(summarizeForgeQueue(queue), { total: 2, audio: 1, carousel: 1, youtube: 0, highOrUrgent: 1 });
});
