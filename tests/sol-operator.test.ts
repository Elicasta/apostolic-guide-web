import assert from "node:assert/strict";
import test from "node:test";
import { buildSolOperatorAnalysis, solProgress, type SolPathwayObservation } from "../src/sol-operator-engine";

function pathway(overrides: Partial<SolPathwayObservation> = {}): SolPathwayObservation {
  return {
    slug: "god-is-one",
    title: "God Is One",
    summary: "Begin with Scripture's controlling confession of one indivisible God.",
    collection: "One God and divine identity",
    steps: [
      { title: "Begin with the confession", reference: "Deuteronomy 6:4", explanation: "Israel's central confession names the LORD as one." },
      { title: "No God before or after", reference: "Isaiah 43:10", explanation: "The LORD denies any formed God before Him or after Him." },
      { title: "No God beside Him", reference: "Isaiah 44:8", explanation: "God says He knows no other God or Rock." },
      { title: "Jesus preserves the Shema", reference: "Mark 12:29", explanation: "Jesus keeps the confession of one LORD." },
      { title: "The apostles continue it", reference: "1 Corinthians 8:4", explanation: "Paul carries the same confession into the church." }
    ],
    campaignStatus: "active",
    primaryKeyword: "GOD",
    destinationUrl: "https://app.apostolicguide.com/paths/god-is-one",
    automationLinked: false,
    audioReady: true,
    scriptApproved: true,
    theologyPassed: true,
    audioMatchesScript: true,
    videoProjectReady: false,
    youtubeRenderState: null,
    youtubePublished: false,
    carouselAssets: 0,
    carouselPublished: 0,
    activeRecipes: [],
    ...overrides
  };
}

test("approved audio with a passing exact theology check becomes a YouTube proposal", () => {
  const analysis = buildSolOperatorAnalysis({ pathways: [pathway()], weeklyTargets: {}, weeklyActuals: {} });
  const proposal = analysis.proposals.find((item) => item.recipeKey === "audio_to_youtube");
  assert.ok(proposal);
  assert.deepEqual(proposal.pathwaySlugs, ["god-is-one"]);
  assert.ok(proposal.plan.some((step) => step.gate === "theology"));
  assert.ok(proposal.plan.some((step) => step.gate === "review"));
});

test("a stale or unchecked script cannot be queued for video production", () => {
  const analysis = buildSolOperatorAnalysis({ pathways: [pathway({ theologyPassed: false })], weeklyTargets: {}, weeklyActuals: {} });
  assert.equal(analysis.proposals.some((item) => item.recipeKey === "audio_to_youtube"), false);
});

test("the carousel proposal derives five topics from the canonical Pathway steps", () => {
  const analysis = buildSolOperatorAnalysis({ pathways: [pathway()], weeklyTargets: {}, weeklyActuals: {} });
  const proposal = analysis.proposals.find((item) => item.recipeKey === "carousel_topic_pack");
  assert.ok(proposal);
  const topics = proposal.inputs.topics as Array<{ title: string; reference: string; prompt: string }>;
  assert.equal(topics.length, 5);
  assert.equal(topics[0]?.reference, "Deuteronomy 6:4");
  assert.match(topics[4]?.prompt ?? "", /God Is One Pathway/);
});

test("keyword projects receive disabled automation and draft journey proposals only", () => {
  const analysis = buildSolOperatorAnalysis({ pathways: [pathway()], weeklyTargets: {}, weeklyActuals: {} });
  const proposal = analysis.proposals.find((item) => item.recipeKey === "journey_automation_draft");
  assert.ok(proposal);
  assert.equal(proposal.risk, "safe_draft");
  assert.ok(proposal.suggestedConstraints.includes("Do not message or enroll anyone"));
});

test("active recipes suppress duplicate work proposals", () => {
  const analysis = buildSolOperatorAnalysis({ pathways: [pathway({ activeRecipes: ["audio_to_youtube", "carousel_topic_pack", "journey_automation_draft"] })], weeklyTargets: {}, weeklyActuals: {} });
  assert.equal(analysis.proposals.length, 0);
});

test("weekly KPI pace and progress are calculated without AI", () => {
  const analysis = buildSolOperatorAnalysis({ pathways: [pathway()], weeklyTargets: { youtube: 2, carousel: 3 }, weeklyActuals: { youtube: 1, carousel: 3 } });
  assert.deepEqual(analysis.kpis.find((item) => item.key === "youtube"), { key: "youtube", label: "YouTube videos", target: 2, actual: 1 });
  assert.equal(solProgress(3, 5), 60);
  assert.equal(solProgress(9, 5), 100);
});
