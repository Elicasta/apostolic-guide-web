import assert from "node:assert/strict";
import test from "node:test";
import { buildEpisodeGrowthPlanPrompt, episodeGrowthPlanMatchesSource, episodeGrowthSourceFingerprint, episodeGrowthPlanSchema, evaluateYoutubeGrowthLearning, selectEpisodeGrowthPackage } from "../src/video-producer-growth";
import { buildEpisodeGenerationPrompt } from "../src/video-producer-episode-script";

const source = { workingTitle: "Jesus Is God", premise: "Explain seven texts.", primaryPathwaySlug: "jesus-is-god", supportingPathwaySlugs: ["god-is-one"], format: "solo", speakers: [{ name: "Cedar", role: "host" }] };
const core = {
  audience: { viewerState: "Curious Christian", tension: "The texts demand an explanation.", promise: "Follow the text without shortcuts.", payoff: "See how the passages fit one God revealed in Christ." },
  packaging: { titleCandidates: ["7 Bible Verses That Become a Problem If Jesus Isn't God", "If Jesus Isn't God, Explain These 7 Verses", "Who Does the Bible Actually Say Jesus Is?"], selectedTitleIndex: 0, thumbnailConcepts: [{ copy: "THEN WHO IS JESUS?", visual: "Host beside an open Bible.", mechanism: "curiosity" as const }, { copy: "ONE GOD. THEN THIS.", visual: "Isaiah beside John.", mechanism: "contrast" as const }], selectedThumbnailIndex: 0, clickReason: "Resolve the tension.", deliveryExpectation: "Explain the passages in sequence." },
  retention: { hook: "If Jesus is not God, several passages become impossible to ignore.", firstMinuteBeats: ["State the tension.", "Remove labels.", "Start with one God."], openLoops: ["Thomas's confession."], patternInterrupts: ["Scripture graphic.", "Camera B objection."], payoff: "The texts converge on one God revealed in Christ." },
  production: { resetBeats: [], bRoll: [], graphics: [] },
  shorts: [{ hook: "Before Him? No God.", angle: "Isaiah", cta: "Read the Pathway." }, { hook: "Thomas's confession.", angle: "John", cta: "Watch the episode." }, { hook: "Creation creates a problem.", angle: "Creation", cta: "Open Apostolic Guide." }],
  publishing: { descriptionAngle: "Seven texts", pinnedComment: "Which verse is hardest?", primaryCta: "Continue the Pathway." }
};
function plan() { return episodeGrowthPlanSchema.parse({ version: 1, contentRevision: "2026-08-29T03:00:00.000Z", sourceFingerprint: episodeGrowthSourceFingerprint(source), ...core }); }

test("package fingerprints source inputs but selection preserves strategy revision", () => {
  const growth = plan();
  assert.equal(episodeGrowthPlanMatchesSource(growth, episodeGrowthSourceFingerprint(source)), true);
  assert.equal(episodeGrowthPlanMatchesSource(growth, episodeGrowthSourceFingerprint({ ...source, premise: "Changed." })), false);
  assert.equal(selectEpisodeGrowthPackage(growth, { titleIndex: 2 }).contentRevision, growth.contentRevision);
});

test("package and script prompts enforce click-to-payoff continuity", () => {
  const packagePrompt = buildEpisodeGrowthPlanPrompt({ workingTitle: source.workingTitle, premise: source.premise, formatLabel: "Solo episode", speakers: ["Cedar (host)"], pathwaySource: "PATHWAY: Jesus Is God" });
  assert.match(packagePrompt, /thumbnail and title must complement/i);
  assert.match(packagePrompt, /B-roll and graphics are separate visual layers/i);
  const scriptPrompt = buildEpisodeGenerationPrompt({ title: source.workingTitle, premise: source.premise, format: "solo", speakers: source.speakers, pathwaySource: "PATHWAY: Jesus Is God", growthPlan: plan() });
  assert.match(scriptPrompt, /delivery contract/i);
  assert.match(scriptPrompt, /Do not bait-and-switch/i);
});

test("learning waits for channel history and separates click from retention", () => {
  const snapshot = { capturedAt: "2026-08-29T03:00:00.000Z", impressions: 7000, views: 900, clickThroughRate: 7.2, averageViewDurationSeconds: 410, averagePercentageViewed: 42, first30SecondRetention: 55, subscribersGained: 20, shortsViews: null, shortsAveragePercentageViewed: null };
  assert.equal(evaluateYoutubeGrowthLearning(snapshot).state, "collecting_baseline");
  const learned = evaluateYoutubeGrowthLearning(snapshot, { sampleEpisodes: 6, clickThroughRate: 5.5, averagePercentageViewed: 50, first30SecondRetention: 70 });
  assert.equal(learned.packaging, "up");
  assert.equal(learned.retention, "down");
  assert.match(learned.nextExperiment, /first 30 seconds/i);
});
