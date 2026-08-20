import assert from "node:assert/strict";
import test from "node:test";
import type { SolProposal, SolRun } from "../src/sol-operator";
import { isTrustedAutoRunnableProposal, selectTrustedAutoRunCandidates } from "../src/sol-trusted-policy";

function proposal(overrides: Partial<SolProposal> = {}): SolProposal {
  return {
    id: "proposal-safe",
    proposalKey: "safe-key",
    recipeKey: "journey_automation_draft",
    title: "Draft journey",
    summary: "Create disabled follow-up drafts.",
    status: "pending",
    priority: "medium",
    risk: "safe_draft",
    pathwaySlugs: ["god-is-one"],
    evidence: [],
    plan: [],
    inputs: {},
    suggestedConstraints: ["Do not message or enroll anyone"],
    approvalConstraints: [],
    createdAt: "2026-08-16T01:00:00.000Z",
    updatedAt: "2026-08-16T01:00:00.000Z",
    ...overrides
  };
}

function run(overrides: Partial<SolRun> = {}): SolRun {
  return {
    id: "run-1",
    proposalId: null,
    recipeKey: "journey_automation_draft",
    pathwaySlug: "god-is-one",
    status: "running",
    progress: 50,
    currentStep: "create_automation",
    inputs: {},
    steps: [],
    result: {},
    error: null,
    createdAt: "2026-08-16T01:00:00.000Z",
    updatedAt: "2026-08-16T01:00:00.000Z",
    ...overrides
  };
}

test("Trusted auto-run accepts only pending safe-draft recipes on the explicit allowlist", () => {
  assert.equal(isTrustedAutoRunnableProposal(proposal()), true);
  assert.equal(isTrustedAutoRunnableProposal(proposal({ recipeKey: "pathway_audio_stage" })), true);
  assert.equal(isTrustedAutoRunnableProposal(proposal({ risk: "review_required" })), false);
  assert.equal(isTrustedAutoRunnableProposal(proposal({ risk: "external_effect" })), false);
  assert.equal(isTrustedAutoRunnableProposal(proposal({ status: "approved" })), false);
  assert.equal(isTrustedAutoRunnableProposal(proposal({ recipeKey: "audio_to_youtube", risk: "safe_draft" })), false);
  assert.equal(isTrustedAutoRunnableProposal(proposal({ recipeKey: "carousel_topic_pack", risk: "safe_draft" })), false);
});

test("Trusted mode never auto-runs review-required production work", () => {
  const candidates = selectTrustedAutoRunCandidates({
    proposals: [
      proposal({ id: "video", recipeKey: "audio_to_youtube", risk: "review_required", priority: "urgent" }),
      proposal({ id: "carousel", recipeKey: "carousel_topic_pack", risk: "review_required", priority: "urgent" }),
      proposal({ id: "draft", priority: "low" })
    ],
    runs: [],
    maxConcurrentRuns: 3
  });
  assert.deepEqual(candidates.map((item) => item.id), ["draft"]);
});

test("Trusted selection respects active-run capacity", () => {
  const candidates = selectTrustedAutoRunCandidates({
    proposals: [proposal({ id: "a" }), proposal({ id: "b", proposalKey: "b", createdAt: "2026-08-16T01:01:00.000Z" })],
    runs: [run()],
    maxConcurrentRuns: 1
  });
  assert.equal(candidates.length, 0);
});

test("Trusted selection prefers higher priority safe drafts", () => {
  const candidates = selectTrustedAutoRunCandidates({
    proposals: [
      proposal({ id: "low", priority: "low", proposalKey: "low" }),
      proposal({ id: "high", priority: "high", proposalKey: "high", recipeKey: "pathway_audio_stage" }),
      proposal({ id: "urgent", priority: "urgent", proposalKey: "urgent" })
    ],
    runs: [],
    maxConcurrentRuns: 2
  });
  assert.deepEqual(candidates.map((item) => item.id), ["urgent", "high"]);
});
