import { deriveSolRunStatus } from "./sol-core/runtime/state-machine";
import type { SolRunStatus, SolTaskStatus } from "./sol-core/types/runtime";
import { createServiceClient } from "./supabase";

type Service = NonNullable<ReturnType<typeof createServiceClient>>;

type LegacyRun = Record<string, unknown>;
type ReviewDecision = "approved" | "changes_requested" | "rejected";

function object(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function requireService() {
  const service = createServiceClient();
  if (!service) throw new Error("SOL Runtime database is not configured.");
  return service;
}

async function appendRuntimeEvent(service: Service, input: {
  runId: string;
  taskId?: string | null;
  eventType: string;
  message: string;
  details?: Record<string, unknown>;
}) {
  const result = await service.from("sol_runtime_events").insert({
    run_id: input.runId,
    task_id: input.taskId ?? null,
    event_type: input.eventType,
    message: input.message,
    details: input.details ?? {}
  });
  if (result.error) throw result.error;
}

async function reconcileRuntimeRunFromTasks(service: Service, runId: string) {
  const [runResult, tasksResult] = await Promise.all([
    service.from("sol_runtime_runs").select("status").eq("id", runId).single(),
    service.from("sol_runtime_tasks").select("status").eq("run_id", runId)
  ]);
  if (runResult.error) throw runResult.error;
  if (tasksResult.error) throw tasksResult.error;

  const current = String(runResult.data.status) as SolRunStatus;
  const statuses = (tasksResult.data ?? []).map((task) => String(task.status) as SolTaskStatus);
  const next = deriveSolRunStatus(current, statuses);
  if (next === current) return next;

  const terminal = ["completed", "failed", "stalled", "cancelled", "superseded"].includes(next);
  const update = await service.from("sol_runtime_runs").update({
    status: next,
    completed_at: terminal ? new Date().toISOString() : null
  }).eq("id", runId);
  if (update.error) throw update.error;
  await appendRuntimeEvent(service, {
    runId,
    eventType: next === "completed" ? "run.completed" : next === "failed" ? "run.failed" : `run.${next}`,
    message: `Run is ${next.replaceAll("_", " ")}.`,
    details: { previousStatus: current, source: "review_resolution" }
  });
  return next;
}

export type SolRuntimeReviewView = {
  id: string;
  runId: string;
  taskId: string;
  type: string;
  status: "pending" | "approved" | "rejected" | "changes_requested" | "expired";
  requestedAction: string;
  requestedAt: string;
  resolvedAt: string | null;
  note: string | null;
  decision: Record<string, unknown>;
  artifact: {
    id: string;
    type: string;
    title: string;
    location: string;
    metadata: Record<string, unknown>;
    verificationStatus: string;
  } | null;
  run: {
    goal: string;
    workflowKey: string | null;
    workflowVersion: number | null;
    status: string;
    legacyRunId: string | null;
  };
};

export async function createLegacyRuntimeReview(input: {
  legacyRun: LegacyRun;
  artifact: {
    type: string;
    title: string;
    storageType: "database" | "file" | "url" | "external";
    location: string;
    metadata?: Record<string, unknown>;
    verificationStatus?: "pending" | "passed" | "failed";
  };
  requestedAction?: string;
}) {
  const service = await requireService();
  const legacyRunId = String(input.legacyRun.id || "");
  if (!legacyRunId) throw new Error("Legacy SOL run id is required for runtime review migration.");

  const existingRun = await service.from("sol_runtime_runs")
    .select("id")
    .eq("legacy_run_id", legacyRunId)
    .maybeSingle();
  if (existingRun.error) throw existingRun.error;
  if (existingRun.data?.id) {
    const existingApproval = await service.from("sol_runtime_approvals")
      .select("id,status")
      .eq("run_id", existingRun.data.id)
      .eq("type", "review")
      .order("requested_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingApproval.error) throw existingApproval.error;
    if (existingApproval.data) return { runtimeRunId: existingRun.data.id as string, reviewId: existingApproval.data.id as string };
  }

  const recipe = String(input.legacyRun.recipe_key || "legacy");
  const pathwaySlug = input.legacyRun.pathway_slug ? String(input.legacyRun.pathway_slug) : null;
  const goal = String(object(input.legacyRun.inputs).proposalTitle || `${recipe.replaceAll("_", " ")} review`);
  const idempotencyKey = `legacy:${legacyRunId}:review`;
  const runInsert = await service.from("sol_runtime_runs").insert({
    user_id: input.legacyRun.approved_by ?? null,
    goal,
    intent: { type: "legacy_recipe_migration", recipe, pathwaySlug },
    workflow_key: `apostolic.${recipe}`,
    workflow_version: 1,
    runtime_version: 1,
    environment: "production",
    mode: "assist",
    status: "waiting_for_approval",
    input: object(input.legacyRun.inputs),
    output: object(input.legacyRun.result),
    idempotency_key: idempotencyKey,
    legacy_run_id: legacyRunId,
    legacy_proposal_id: input.legacyRun.proposal_id ?? null,
    started_at: input.legacyRun.started_at ?? input.legacyRun.created_at ?? new Date().toISOString()
  }).select("id").single();
  if (runInsert.error) throw runInsert.error;
  const runtimeRunId = String(runInsert.data.id);

  const legacySteps = Array.isArray(input.legacyRun.steps) ? input.legacyRun.steps as Array<Record<string, unknown>> : [];
  const completedSteps = legacySteps.filter((step) => String(step.key) !== "review");
  if (completedSteps.length) {
    const taskInsert = await service.from("sol_runtime_tasks").insert(completedSteps.map((step, index) => ({
      run_id: runtimeRunId,
      task_key: String(step.key || `legacy_${index + 1}`),
      name: String(step.label || step.key || `Legacy task ${index + 1}`),
      tool_name: `legacy.${recipe}.${String(step.key || index + 1)}`,
      status: String(step.status) === "failed" ? "failed" : "completed",
      input: {},
      output: { migratedFromLegacy: true, detail: step.detail ?? null },
      depends_on: index === 0 ? [] : [String(completedSteps[index - 1]?.key || `legacy_${index}`)],
      permission: "execute",
      environment: "production",
      attempt_count: 1,
      max_attempts: 1,
      started_at: input.legacyRun.started_at ?? null,
      completed_at: new Date().toISOString()
    })));
    if (taskInsert.error) throw taskInsert.error;
  }

  const reviewTaskInsert = await service.from("sol_runtime_tasks").insert({
    run_id: runtimeRunId,
    task_key: "review",
    name: "Human review",
    workflow_name: "runtime.review",
    status: "waiting_for_approval",
    input: { pathwaySlug, recipe },
    output: {},
    depends_on: completedSteps.length ? [String(completedSteps.at(-1)?.key)] : [],
    permission: "write",
    environment: "production",
    approval_type: "review",
    max_attempts: 1,
    started_at: new Date().toISOString()
  }).select("id").single();
  if (reviewTaskInsert.error) throw reviewTaskInsert.error;
  const reviewTaskId = String(reviewTaskInsert.data.id);

  const artifactInsert = await service.from("sol_runtime_artifacts").insert({
    run_id: runtimeRunId,
    task_id: reviewTaskId,
    type: input.artifact.type,
    title: input.artifact.title,
    storage_type: input.artifact.storageType,
    location: input.artifact.location,
    metadata: { ...(input.artifact.metadata ?? {}), legacyRunId, pathwaySlug, recipe },
    verification_status: input.artifact.verificationStatus ?? "passed"
  }).select("id").single();
  if (artifactInsert.error) throw artifactInsert.error;
  const artifactId = String(artifactInsert.data.id);

  const approvalInsert = await service.from("sol_runtime_approvals").insert({
    run_id: runtimeRunId,
    task_id: reviewTaskId,
    type: "review",
    requested_action: input.requestedAction ?? `Review ${input.artifact.title}`,
    artifact_ids: [artifactId],
    status: "pending"
  }).select("id").single();
  if (approvalInsert.error) throw approvalInsert.error;
  const reviewId = String(approvalInsert.data.id);

  await appendRuntimeEvent(service, { runId: runtimeRunId, eventType: "run.created", message: "Legacy SOL execution adopted by SOL Runtime for durable review.", details: { legacyRunId, recipe } });
  await appendRuntimeEvent(service, { runId: runtimeRunId, taskId: reviewTaskId, eventType: "artifact.created", message: `${input.artifact.title} registered for review.`, details: { artifactId } });
  await appendRuntimeEvent(service, { runId: runtimeRunId, taskId: reviewTaskId, eventType: "approval.requested", message: "Human review requested.", details: { reviewId, artifactId } });
  return { runtimeRunId, reviewId };
}

export async function getSolRuntimeReview(reviewId: string): Promise<SolRuntimeReviewView | null> {
  const service = await requireService();
  const approval = await service.from("sol_runtime_approvals").select("*").eq("id", reviewId).maybeSingle();
  if (approval.error) throw approval.error;
  if (!approval.data) return null;
  const [runResult, artifactResult] = await Promise.all([
    service.from("sol_runtime_runs").select("goal,workflow_key,workflow_version,status,legacy_run_id").eq("id", approval.data.run_id).single(),
    approval.data.artifact_ids?.[0]
      ? service.from("sol_runtime_artifacts").select("id,type,title,location,metadata,verification_status").eq("id", approval.data.artifact_ids[0]).maybeSingle()
      : Promise.resolve({ data: null, error: null })
  ]);
  if (runResult.error) throw runResult.error;
  if (artifactResult.error) throw artifactResult.error;
  return {
    id: String(approval.data.id),
    runId: String(approval.data.run_id),
    taskId: String(approval.data.task_id),
    type: String(approval.data.type),
    status: approval.data.status as SolRuntimeReviewView["status"],
    requestedAction: String(approval.data.requested_action),
    requestedAt: String(approval.data.requested_at),
    resolvedAt: approval.data.resolved_at ? String(approval.data.resolved_at) : null,
    note: approval.data.note ? String(approval.data.note) : null,
    decision: object(approval.data.decision),
    artifact: artifactResult.data ? {
      id: String(artifactResult.data.id),
      type: String(artifactResult.data.type),
      title: String(artifactResult.data.title),
      location: String(artifactResult.data.location),
      metadata: object(artifactResult.data.metadata),
      verificationStatus: String(artifactResult.data.verification_status)
    } : null,
    run: {
      goal: String(runResult.data.goal),
      workflowKey: runResult.data.workflow_key ? String(runResult.data.workflow_key) : null,
      workflowVersion: runResult.data.workflow_version == null ? null : Number(runResult.data.workflow_version),
      status: String(runResult.data.status),
      legacyRunId: runResult.data.legacy_run_id ? String(runResult.data.legacy_run_id) : null
    }
  };
}

export async function listPendingSolRuntimeReviews(limit = 24) {
  const service = await requireService();
  const result = await service.from("sol_runtime_approvals")
    .select("id")
    .eq("type", "review")
    .eq("status", "pending")
    .order("requested_at", { ascending: true })
    .limit(Math.max(1, Math.min(limit, 100)));
  if (result.error) throw result.error;
  const reviews = await Promise.all((result.data ?? []).map((item) => getSolRuntimeReview(String(item.id))));
  return reviews.filter((item): item is SolRuntimeReviewView => Boolean(item));
}

async function settleLegacyProposal(service: Service, proposalId: string | null) {
  if (!proposalId) return;
  const runs = await service.from("sol_operator_runs").select("status").eq("proposal_id", proposalId);
  if (runs.error || !runs.data?.length) return;
  if (runs.data.some((item) => ["queued", "running", "retrying", "waiting_review"].includes(String(item.status)))) return;
  const failedOnly = runs.data.every((item) => ["failed", "stalled", "cancelled"].includes(String(item.status)));
  await service.from("sol_operator_proposals").update({ status: failedOnly ? "failed" : "completed" }).eq("id", proposalId);
}

export async function resolveSolRuntimeReview(input: {
  reviewId: string;
  decision: ReviewDecision;
  userId: string;
  note?: string;
}) {
  const service = await requireService();
  const review = await getSolRuntimeReview(input.reviewId);
  if (!review) throw new Error("SOL review not found.");
  if (review.status !== "pending") throw new Error("That SOL review has already been resolved.");
  const now = new Date().toISOString();
  const approvalStatus = input.decision;
  const approvalUpdate = await service.from("sol_runtime_approvals").update({
    status: approvalStatus,
    resolved_at: now,
    resolved_by: input.userId,
    note: input.note?.trim() || null,
    decision: { action: input.decision === "approved" ? "approve" : input.decision === "rejected" ? "reject" : "changes_requested", note: input.note?.trim() || null, userId: input.userId }
  }).eq("id", input.reviewId).eq("status", "pending").select("id").maybeSingle();
  if (approvalUpdate.error) throw approvalUpdate.error;
  if (!approvalUpdate.data) throw new Error("That SOL review changed before your decision was saved.");

  if (input.decision === "approved") {
    const task = await service.from("sol_runtime_tasks").update({
      status: "completed",
      output: { approved: true, reviewId: input.reviewId },
      completed_at: now,
      heartbeat_at: null,
      lease_expires_at: null,
      worker_id: null
    }).eq("id", review.taskId).eq("status", "waiting_for_approval").select("id").maybeSingle();
    if (task.error) throw task.error;
    if (!task.data) throw new Error("The review task changed before approval could be applied.");

    const unblock = await service.rpc("sol_runtime_unblock_tasks", { p_run_id: review.runId });
    if (unblock.error) throw unblock.error;
    await reconcileRuntimeRunFromTasks(service, review.runId);

    if (review.run.legacyRunId) {
      const legacy = await service.from("sol_operator_runs").select("steps,proposal_id,result").eq("id", review.run.legacyRunId).maybeSingle();
      if (legacy.error) throw legacy.error;
      if (legacy.data) {
        const steps = Array.isArray(legacy.data.steps) ? legacy.data.steps.map((step: Record<string, unknown>) => String(step.key) === "review" ? { ...step, status: "completed", detail: "Approved through SOL Runtime review." } : step) : [];
        const result = await service.from("sol_operator_runs").update({ status: "completed", progress: 100, current_step: "review", steps, result: { ...object(legacy.data.result), reviewId: input.reviewId, reviewStatus: "approved" }, completed_at: now, error: null }).eq("id", review.run.legacyRunId);
        if (result.error) throw result.error;
        await settleLegacyProposal(service, legacy.data.proposal_id ? String(legacy.data.proposal_id) : null);
      }
    }
  } else if (input.decision === "changes_requested") {
    const reviewTask = await service.from("sol_runtime_tasks").update({ status: "repairing", output: { reviewId: input.reviewId, changesRequested: true, note: input.note?.trim() || null } }).eq("id", review.taskId);
    if (reviewTask.error) throw reviewTask.error;
    const repairTaskKey = `repair_after_review_${input.reviewId.replaceAll("-", "").slice(0, 12)}`;
    const existingRepair = await service.from("sol_runtime_tasks").select("id").eq("run_id", review.runId).eq("task_key", repairTaskKey).maybeSingle();
    if (existingRepair.error) throw existingRepair.error;
    if (!existingRepair.data) {
      const repair = await service.from("sol_runtime_tasks").insert({
        run_id: review.runId,
        task_key: repairTaskKey,
        name: "Repair requested artifact",
        workflow_name: "brain.repair_from_review",
        status: "stalled",
        input: { reviewId: input.reviewId, note: input.note?.trim() || null, artifactId: review.artifact?.id ?? null },
        depends_on: [],
        permission: "write",
        environment: "production",
        max_attempts: 3,
        error_code: "PLANNER_REQUIRED",
        error_message: "A human requested changes. The repair planner must create a concrete repair plan before execution."
      });
      if (repair.error) throw repair.error;
    }
    const run = await service.from("sol_runtime_runs").update({ status: "repairing", completed_at: null }).eq("id", review.runId);
    if (run.error) throw run.error;
    if (review.run.legacyRunId) {
      const legacy = await service.from("sol_operator_runs").select("result").eq("id", review.run.legacyRunId).maybeSingle();
      if (legacy.error) throw legacy.error;
      const result = await service.from("sol_operator_runs").update({ status: "stalled", current_step: "review", result: { ...object(legacy.data?.result), reviewId: input.reviewId, reviewStatus: "changes_requested", reviewNote: input.note?.trim() || null }, completed_at: null, error: "Changes requested. SOL Runtime is waiting for a repair plan." }).eq("id", review.run.legacyRunId);
      if (result.error) throw result.error;
    }
    await appendRuntimeEvent(service, { runId: review.runId, taskId: review.taskId, eventType: "repair.created", message: "Review requested changes. Repair planning is required before more execution.", details: { reviewId: input.reviewId, note: input.note?.trim() || null, repairTaskKey } });
  } else {
    const task = await service.from("sol_runtime_tasks").update({ status: "cancelled", output: { reviewId: input.reviewId, rejected: true }, completed_at: now }).eq("id", review.taskId);
    if (task.error) throw task.error;
    const run = await service.from("sol_runtime_runs").update({ status: "cancelled", completed_at: now }).eq("id", review.runId);
    if (run.error) throw run.error;
    if (review.run.legacyRunId) {
      const legacy = await service.from("sol_operator_runs").select("proposal_id,result").eq("id", review.run.legacyRunId).maybeSingle();
      if (legacy.error) throw legacy.error;
      const result = await service.from("sol_operator_runs").update({ status: "cancelled", result: { ...object(legacy.data?.result), reviewId: input.reviewId, reviewStatus: "rejected" }, completed_at: now, error: null }).eq("id", review.run.legacyRunId);
      if (result.error) throw result.error;
      await settleLegacyProposal(service, legacy.data?.proposal_id ? String(legacy.data.proposal_id) : null);
    }
  }

  await appendRuntimeEvent(service, { runId: review.runId, taskId: review.taskId, eventType: "approval.resolved", message: `Review ${input.decision.replaceAll("_", " ")}.`, details: { reviewId: input.reviewId, userId: input.userId, note: input.note?.trim() || null } });
  return getSolRuntimeReview(input.reviewId);
}
