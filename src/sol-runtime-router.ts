import "server-only";
import type { SolMode } from "./sol-core/types/runtime";
import { interpretKnownSolIntent } from "./sol-core/brain/intent";
import { getSolRuntimeWorkflowRegistry } from "./sol-runtime-registry";
import { createSolRuntimeRun } from "./sol-runtime-service";

export async function routeKnownSolRequest(input: { message: string; userId: string; mode: SolMode }) {
  const intent = interpretKnownSolIntent(input.message);
  if (!intent) return null;
  const workflows = getSolRuntimeWorkflowRegistry();
  const plan = workflows.createPlan({
    planId: `plan_${intent.workflowKey.replace(/[^a-z0-9]+/gi, "_")}_${Date.now()}`,
    key: intent.workflowKey,
    version: intent.workflowVersion,
    goal: intent.intent === "prepare_pathway_campaign"
      ? `Prepare a review-ready campaign for ${String(intent.input.pathway)}`
      : input.message,
    environment: "production",
    workflowInput: intent.input
  });
  const result = await createSolRuntimeRun({
    plan,
    userId: input.userId,
    mode: input.mode,
    intent: { intent: intent.intent, desiredOutcome: intent.intent === "prepare_pathway_campaign" ? "review_ready_campaign" : "verified_result", environment: "production", publishRequested: false },
    input: intent.input,
    identity: intent.identity,
    plannerVersion: "deterministic-workflow-router-v1"
  });
  return { ...result, intent, plan };
}
