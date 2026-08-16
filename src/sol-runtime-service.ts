import "server-only";
import type { SolMode, SolPlan } from "./sol-core/types/runtime";
import { validateSolPlan } from "./sol-core/runtime/task-graph";
import { solRunIdempotencyKey } from "./sol-core/runtime/idempotency";
import { createServiceClient } from "./supabase";

export type CreateSolRuntimeRunInput = {
  plan: SolPlan;
  userId?: string | null;
  mode: SolMode;
  intent?: Record<string, unknown>;
  input?: Record<string, unknown>;
  identity?: Record<string, unknown>;
  forceRun?: boolean;
  plannerVersion?: string | null;
};

export async function createSolRuntimeRun(input: CreateSolRuntimeRunInput) {
  const service = createServiceClient();
  if (!service) throw new Error("SOL Runtime database is not configured.");
  const plan = validateSolPlan(input.plan);
  const workflowKey = plan.workflow?.key ?? null;
  const workflowVersion = plan.workflow?.version ?? null;
  const idempotencyKey = workflowKey && workflowVersion
    ? solRunIdempotencyKey({
        workflowKey,
        workflowVersion,
        environment: plan.environment,
        identity: input.identity ?? input.input ?? { goal: plan.goal }
      })
    : null;

  const result = await service.rpc("sol_runtime_create_run", {
    p_run: {
      workspaceKey: "apostolic-guide",
      userId: input.userId ?? null,
      goal: plan.goal,
      intent: input.intent ?? {},
      workflowKey,
      workflowVersion,
      runtimeVersion: 1,
      plannerVersion: input.plannerVersion ?? null,
      environment: plan.environment,
      mode: input.mode,
      input: input.input ?? {}
    },
    p_tasks: plan.tasks,
    p_idempotency_key: idempotencyKey,
    p_force_run: input.forceRun === true
  });
  if (result.error) throw result.error;
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  if (!row?.run_id) throw new Error("SOL Runtime did not return a run id.");
  return {
    runId: String(row.run_id),
    reused: row.reused === true,
    executionGeneration: Number(row.execution_generation) || 1,
    idempotencyKey
  };
}
