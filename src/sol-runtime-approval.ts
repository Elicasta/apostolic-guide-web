import "server-only";
import { createServiceClient } from "./supabase";
import { getSolRuntimeReview, resolveSolRuntimeReview } from "./sol-runtime-review";

type ReviewDecision = "approved" | "changes_requested" | "rejected";

function object(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function reconcileRun(runId: string) {
  const service = createServiceClient();
  if (!service) throw new Error("SOL Runtime database is not configured.");
  const tasks = await service.from("sol_runtime_tasks").select("status").eq("run_id", runId);
  if (tasks.error) throw tasks.error;
  const statuses = (tasks.data ?? []).map((item) => String(item.status));
  if (!statuses.length) return;

  let status: string;
  if (statuses.includes("waiting_for_approval")) status = "waiting_for_approval";
  else if (statuses.includes("repairing")) status = "repairing";
  else if (statuses.includes("running") || statuses.includes("verifying")) status = "running";
  else if (statuses.includes("retry_scheduled")) status = "retrying";
  else if (statuses.some((item) => ["queued", "blocked", "pending", "waiting"].includes(item))) status = "running";
  else if (statuses.includes("stalled")) status = "stalled";
  else if (statuses.includes("failed")) status = "failed";
  else if (statuses.every((item) => ["completed", "skipped"].includes(item))) status = "completed";
  else status = "stalled";

  const terminal = ["completed", "failed", "stalled", "cancelled", "superseded"].includes(status);
  const update = await service.from("sol_runtime_runs").update({ status, completed_at: terminal ? new Date().toISOString() : null }).eq("id", runId).neq("status", "cancelled").neq("status", "superseded");
  if (update.error) throw update.error;
}

async function event(input: { runId: string; taskId: string; eventType: string; message: string; details?: Record<string, unknown> }) {
  const service = createServiceClient();
  if (!service) throw new Error("SOL Runtime database is not configured.");
  const result = await service.from("sol_runtime_events").insert({ run_id: input.runId, task_id: input.taskId, event_type: input.eventType, message: input.message, details: input.details ?? {} });
  if (result.error) throw result.error;
}

export async function resolveSolRuntimeApproval(input: { reviewId: string; decision: ReviewDecision; userId: string; note?: string }) {
  const service = createServiceClient();
  if (!service) throw new Error("SOL Runtime database is not configured.");

  const approval = await service.from("sol_runtime_approvals").select("id,run_id,task_id,type,status").eq("id", input.reviewId).maybeSingle();
  if (approval.error) throw approval.error;
  if (!approval.data) throw new Error("SOL approval not found.");
  if (approval.data.status !== "pending") throw new Error("That SOL approval has already been resolved.");

  const run = await service.from("sol_runtime_runs").select("legacy_run_id,workflow_key,workflow_version,environment,mode").eq("id", approval.data.run_id).single();
  if (run.error) throw run.error;
  if (run.data.legacy_run_id) return resolveSolRuntimeReview(input);

  const task = await service.from("sol_runtime_tasks").select("id,task_key,status,tool_name,workflow_name,input,output").eq("id", approval.data.task_id).single();
  if (task.error) throw task.error;
  if (task.data.status !== "waiting_for_approval") throw new Error(`Approval task is ${task.data.status}, not waiting for approval.`);

  const now = new Date().toISOString();
  const note = input.note?.trim() || null;
  const approvalUpdate = await service.from("sol_runtime_approvals").update({
    status: input.decision,
    resolved_at: now,
    resolved_by: input.userId,
    note,
    decision: { action: input.decision === "approved" ? "approve" : input.decision === "rejected" ? "reject" : "changes_requested", note, userId: input.userId }
  }).eq("id", input.reviewId).eq("status", "pending").select("id").maybeSingle();
  if (approvalUpdate.error) throw approvalUpdate.error;
  if (!approvalUpdate.data) throw new Error("That SOL approval changed before your decision was saved.");

  if (input.decision === "approved") {
    const existingOutput = object(task.data.output);
    const pureReviewGate = !task.data.tool_name && task.data.workflow_name === "runtime.review";
    if (pureReviewGate) {
      const taskInput = object(task.data.input);
      const complete = await service.from("sol_runtime_tasks").update({
        status: "completed",
        output: { ...existingOutput, approvalId: input.reviewId, approvalGranted: true, approved: true },
        completed_at: now,
        worker_id: null,
        heartbeat_at: null,
        lease_expires_at: null,
        error_code: null,
        error_message: null
      }).eq("id", task.data.id).eq("status", "waiting_for_approval");
      if (complete.error) throw complete.error;

      const repairOfTaskId = typeof taskInput.repairOfTaskId === "string" ? taskInput.repairOfTaskId : null;
      if (repairOfTaskId) {
        const closeOriginal = await service.from("sol_runtime_tasks").update({
          status: "completed",
          output: { repaired: true, repairReviewId: input.reviewId, repairApprovedAt: now },
          completed_at: now,
          worker_id: null,
          heartbeat_at: null,
          lease_expires_at: null,
          error_code: null,
          error_message: null
        }).eq("id", repairOfTaskId).eq("status", "repairing");
        if (closeOriginal.error) throw closeOriginal.error;
        await event({ runId: String(approval.data.run_id), taskId: repairOfTaskId, eventType: "repair.completed", message: "Requested changes were repaired and the replacement review was approved.", details: { approvalId: input.reviewId } });
      }

      const unblock = await service.rpc("sol_runtime_unblock_tasks", { p_run_id: approval.data.run_id });
      if (unblock.error) throw unblock.error;
      await event({ runId: String(approval.data.run_id), taskId: String(task.data.id), eventType: "task.completed", message: "Human review gate approved and completed.", details: { approvalId: input.reviewId, repaired: Boolean(repairOfTaskId) } });
    } else {
      const resume = await service.from("sol_runtime_tasks").update({
        status: "queued",
        output: { ...existingOutput, approvalId: input.reviewId, approvalGranted: true },
        completed_at: null,
        worker_id: null,
        heartbeat_at: null,
        lease_expires_at: null,
        next_retry_at: null,
        error_code: null,
        error_message: null
      }).eq("id", task.data.id).eq("status", "waiting_for_approval");
      if (resume.error) throw resume.error;
      await event({ runId: String(approval.data.run_id), taskId: String(task.data.id), eventType: "task.queued", message: "Approval granted. Task requeued for deterministic execution.", details: { approvalId: input.reviewId, approvalType: approval.data.type } });
    }
  } else if (input.decision === "changes_requested") {
    if (!note) throw new Error("Request Changes requires a note describing what should change.");
    const currentOutput = object(task.data.output);
    const updateTask = await service.from("sol_runtime_tasks").update({
      status: "repairing",
      output: { ...currentOutput, approvalId: input.reviewId, changesRequested: true, note },
      worker_id: null,
      heartbeat_at: null,
      lease_expires_at: null
    }).eq("id", task.data.id).eq("status", "waiting_for_approval");
    if (updateTask.error) throw updateTask.error;

    const repairKey = `repair_${String(input.reviewId).replaceAll("-", "").slice(0, 14)}`;
    const repairReviewKey = `review_${String(input.reviewId).replaceAll("-", "").slice(0, 14)}`;
    if (run.data.workflow_key === "apostolic.pathway_campaign.prepare") {
      const repair = await service.from("sol_runtime_tasks").insert({
        run_id: approval.data.run_id,
        task_key: repairKey,
        name: "Repair campaign from review feedback",
        tool_name: "apostolic.campaign.repairFromReview",
        workflow_name: null,
        status: "queued",
        input: { reviewId: input.reviewId, note, sourceTaskId: task.data.id },
        depends_on: [],
        permission: "write",
        environment: run.data.environment || "production",
        idempotency_key: `review-repair:${input.reviewId}`,
        max_attempts: 3,
        retry_strategy: "exponential",
        retry_base_delay_ms: 2000,
        retry_max_delay_ms: 60000,
        timeout_ms: 240000
      });
      if (repair.error && repair.error.code !== "23505") throw repair.error;
      const repairReview = await service.from("sol_runtime_tasks").insert({
        run_id: approval.data.run_id,
        task_key: repairReviewKey,
        name: "Review repaired campaign",
        tool_name: null,
        workflow_name: "runtime.review",
        status: "blocked",
        input: { repairOfTaskId: task.data.id, sourceApprovalId: input.reviewId },
        depends_on: [repairKey],
        permission: "write",
        environment: run.data.environment || "production",
        approval_type: "review",
        max_attempts: 1,
        retry_strategy: "fixed",
        retry_base_delay_ms: 0,
        retry_max_delay_ms: 0,
        timeout_ms: 60000
      });
      if (repairReview.error && repairReview.error.code !== "23505") throw repairReview.error;
      await event({ runId: String(approval.data.run_id), taskId: String(task.data.id), eventType: "repair.created", message: "Changes requested. A campaign repair task and replacement review gate were created.", details: { approvalId: input.reviewId, note, repairKey, repairReviewKey } });
    } else {
      const repair = await service.from("sol_runtime_tasks").insert({
        run_id: approval.data.run_id,
        task_key: repairKey,
        name: "Repair requested artifact",
        workflow_name: "brain.repair_from_review",
        status: "stalled",
        input: { reviewId: input.reviewId, note, sourceTaskId: task.data.id },
        depends_on: [],
        permission: "write",
        environment: run.data.environment || "production",
        max_attempts: 3,
        error_code: "PLANNER_REQUIRED",
        error_message: "Human changes were requested. This workflow has no trusted repair recipe yet."
      });
      if (repair.error && repair.error.code !== "23505") throw repair.error;
      await event({ runId: String(approval.data.run_id), taskId: String(task.data.id), eventType: "repair.created", message: "Changes requested. The run is waiting for a trusted repair recipe.", details: { approvalId: input.reviewId, note } });
    }
  } else {
    const cancel = await service.from("sol_runtime_tasks").update({
      status: "cancelled",
      output: { ...object(task.data.output), approvalId: input.reviewId, rejected: true },
      completed_at: now,
      worker_id: null,
      heartbeat_at: null,
      lease_expires_at: null
    }).eq("id", task.data.id).eq("status", "waiting_for_approval");
    if (cancel.error) throw cancel.error;
    const cancelRun = await service.from("sol_runtime_runs").update({ status: "cancelled", completed_at: now }).eq("id", approval.data.run_id);
    if (cancelRun.error) throw cancelRun.error;
  }

  await event({
    runId: String(approval.data.run_id),
    taskId: String(task.data.id),
    eventType: "approval.resolved",
    message: `Approval ${input.decision.replaceAll("_", " ")}.`,
    details: { approvalId: input.reviewId, userId: input.userId, note }
  });
  if (input.decision !== "rejected") await reconcileRun(String(approval.data.run_id));
  return getSolRuntimeReview(input.reviewId);
}
