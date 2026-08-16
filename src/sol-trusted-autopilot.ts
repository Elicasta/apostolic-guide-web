import { executeSolRuns } from "./sol-operator-executor";
import { getSolOperatorSnapshot } from "./sol-operator";
import { SOL_RECIPE_STEPS } from "./sol-operator-engine";
import { selectTrustedAutoRunCandidates } from "./sol-trusted-policy";
import { createServiceClient } from "./supabase";

type ExecutionContext = { origin: string; cookie: string };

type TrustedRunResult = {
  proposalIds: string[];
  runIds: string[];
  skipped: boolean;
  reason: string | null;
};

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function journeyInputs(inputs: Record<string, unknown>, slug: string, constraints: string[]) {
  const pathways = Array.isArray(inputs.pathways) ? inputs.pathways as Array<Record<string, unknown>> : [];
  const item = pathways.find((candidate) => String(candidate.slug || "") === slug);
  return {
    ...inputs,
    ...record(item),
    slug,
    constraints,
    trustedMode: true
  };
}

export async function runTrustedSolDrafts(context: ExecutionContext): Promise<TrustedRunResult> {
  const service = createServiceClient();
  if (!service) return { proposalIds: [], runIds: [], skipped: true, reason: "storage_not_configured" };

  const snapshot = await getSolOperatorSnapshot();
  if (!snapshot.dbReady) return { proposalIds: [], runIds: [], skipped: true, reason: "storage_not_ready" };
  if (!snapshot.settings.enabled) return { proposalIds: [], runIds: [], skipped: true, reason: "sol_off" };
  if (snapshot.settings.mode !== "trusted") return { proposalIds: [], runIds: [], skipped: true, reason: "not_trusted_mode" };

  const candidates = selectTrustedAutoRunCandidates({
    proposals: snapshot.proposals,
    runs: snapshot.runs,
    maxConcurrentRuns: snapshot.settings.maxConcurrentRuns
  });
  if (!candidates.length) return { proposalIds: [], runIds: [], skipped: true, reason: "no_safe_drafts" };

  const proposalIds: string[] = [];
  const runIds: string[] = [];

  for (const proposal of candidates) {
    const constraints = Array.from(new Set([
      "Trusted mode: safe drafts only",
      ...proposal.suggestedConstraints
    ])).slice(0, 12);

    const claimed = await service
      .from("sol_operator_proposals")
      .update({
        status: "running",
        approved_by: null,
        approved_at: new Date().toISOString(),
        approval_constraints: constraints
      })
      .eq("id", proposal.id)
      .eq("status", "pending")
      .eq("risk", "safe_draft")
      .select("id")
      .maybeSingle();
    if (claimed.error) throw claimed.error;
    if (!claimed.data) continue;

    try {
      const slugs = proposal.pathwaySlugs.length ? proposal.pathwaySlugs : [null];
      const rows = slugs.map((slug) => ({
        proposal_id: proposal.id,
        recipe_key: proposal.recipeKey,
        pathway_slug: slug,
        status: "queued",
        progress: 0,
        current_step: SOL_RECIPE_STEPS[proposal.recipeKey][0]?.key ?? null,
        inputs: slug ? journeyInputs(proposal.inputs, slug, constraints) : { ...proposal.inputs, constraints, trustedMode: true },
        steps: SOL_RECIPE_STEPS[proposal.recipeKey].map((step) => ({ ...step, status: "pending" })),
        requested_by: null
      }));

      const created = await service.from("sol_operator_runs").insert(rows).select("id");
      if (created.error) throw created.error;
      const createdIds = (created.data ?? []).map((item) => String(item.id));
      proposalIds.push(proposal.id);
      runIds.push(...createdIds);
      await service.from("sol_operator_events").insert({
        proposal_id: proposal.id,
        event_type: "trusted.auto_queued",
        detail: {
          recipe_key: proposal.recipeKey,
          pathway_slugs: proposal.pathwaySlugs,
          run_count: createdIds.length,
          constraints
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Trusted Sol setup failed.";
      await service.from("sol_operator_proposals").update({ status: "failed" }).eq("id", proposal.id);
      await service.from("sol_operator_events").insert({
        proposal_id: proposal.id,
        event_type: "trusted.auto_failed",
        detail: { error: message.slice(0, 1800) }
      });
    }
  }

  if (runIds.length) await executeSolRuns(runIds, context);
  return {
    proposalIds,
    runIds,
    skipped: runIds.length === 0,
    reason: runIds.length ? null : "no_claimed_safe_drafts"
  };
}
