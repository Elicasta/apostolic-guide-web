export type SolTeamRunLike = {
  recipeKey: string;
  pathwaySlug: string | null;
  status: string;
  updatedAt?: string;
};

export type SolTeamProposalLike = {
  recipeKey: string;
  pathwaySlugs: string[];
};

export function solTeamRunIsActive(status: string) {
  return ["queued", "running", "retrying"].includes(status);
}

export function solTeamRunNeedsAttention(status: string) {
  return ["waiting_review", "failed", "stalled"].includes(status);
}

export function solTeamRunKey(run: Pick<SolTeamRunLike, "recipeKey" | "pathwaySlug">) {
  return `${run.recipeKey}:${run.pathwaySlug ?? "workspace"}`;
}

export function dedupeSolCurrentRuns<T extends SolTeamRunLike>(runs: T[]) {
  const seen = new Set<string>();
  const visible: T[] = [];
  for (const run of runs) {
    if (!solTeamRunIsActive(run.status) && !solTeamRunNeedsAttention(run.status)) continue;
    const key = solTeamRunKey(run);
    if (seen.has(key)) continue;
    seen.add(key);
    visible.push(run);
  }
  return visible;
}

export function solProposalCoveredByReviewRuns(
  proposal: SolTeamProposalLike,
  reviewRuns: Array<Pick<SolTeamRunLike, "recipeKey" | "pathwaySlug" | "status">>,
) {
  const reviewKeys = new Set(
    reviewRuns
      .filter((run) => run.status === "waiting_review")
      .map((run) => solTeamRunKey(run)),
  );
  const slugs = proposal.pathwaySlugs.length ? proposal.pathwaySlugs : ["workspace"];
  return slugs.every((slug) => reviewKeys.has(`${proposal.recipeKey}:${slug}`));
}
