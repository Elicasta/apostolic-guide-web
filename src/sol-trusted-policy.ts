import type { SolProposal, SolRun } from "./sol-operator";
import type { SolRecipeKey } from "./sol-operator-engine";

const TRUSTED_AUTO_RECIPE_ALLOWLIST = new Set<SolRecipeKey>([
  "forge_carousel_stage",
  "journey_automation_draft"
]);

const PRIORITY_SCORE: Record<SolProposal["priority"], number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3
};

export function isTrustedAutoRunnableProposal(proposal: SolProposal) {
  return proposal.status === "pending"
    && proposal.risk === "safe_draft"
    && TRUSTED_AUTO_RECIPE_ALLOWLIST.has(proposal.recipeKey);
}

export function selectTrustedAutoRunCandidates(input: {
  proposals: SolProposal[];
  runs: SolRun[];
  maxConcurrentRuns: number;
}) {
  const activeRuns = input.runs.filter((run) => run.status === "queued" || run.status === "running" || run.status === "retrying").length;
  const capacity = Math.max(0, Math.min(3, input.maxConcurrentRuns) - activeRuns);
  if (capacity === 0) return [] as SolProposal[];

  return input.proposals
    .filter(isTrustedAutoRunnableProposal)
    .sort((a, b) => PRIORITY_SCORE[a.priority] - PRIORITY_SCORE[b.priority] || a.createdAt.localeCompare(b.createdAt))
    .slice(0, capacity);
}

export function trustedModePolicySummary() {
  return {
    autoRunRisks: ["safe_draft"] as const,
    autoRunRecipes: [...TRUSTED_AUTO_RECIPE_ALLOWLIST],
    blockedRisks: ["review_required", "external_effect"] as const
  };
}
