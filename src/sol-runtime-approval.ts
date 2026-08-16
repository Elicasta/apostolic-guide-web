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
  else if (statuses.includes("running")) status = "running";
  else if (statuses.includes("retry_scheduled")) status = "retrying";
  else if (statuses.some((item) => ["queued", "blocked", "pending", "waiting"].includes(item))) status = "queued";
  else if (statuses.includes("stalled")) status = "stalled";
  else if (statuses.includes("failed")) status = "failed";
  else if (statuses.every((item) => ["completed", "skipped"].includes(item))) status = "completed";
  else status = "stalled";

  const terminal = ["completed", "failed", "stalled", "cancelled", "superseded"].includes(status);
  const update = await service.from("sol_runtime_runs").update({
    status,
    completed_at: terminal ? new Date().toISOString() : null
  }).eq("id", runId).neq("status", "cancelled").neq("status", "superseded");
  if (update.error) throw update.error;
}

async function event(input: { runId: string; taskId: string; eventType: string; message: string; details?: Record<string, unknown> }) {
  const service = createServiceClient();
  if (!service) throw new Error("SOL Runtime database is not configured.");
  const result = await service.from("sol_runtime_events").insert({
    run_id: input.runId,
    task_id: input.taskId,
    event_type: input.eventType,
    message: input.message,
    details: input.details ?? {}
  });
  if (result.error) throw result.error;
}

export async function resolveSolRuntimeApproval(input: {
  reviewId: string;
  decision: ReviewDecision;
  userId: string;
  note?: string;
}) {
  const service = createServiceClient();
  if (!service) throw new Error("SOL Runtime database is not configured.");

  const approval = await service.from("sol_runtime_approvals")
    .select("id,run_id,task_id,type,status")
    .eq("id", input.reviewId)
    .maybeSingle();
  if (approval.error) throw approval.error;
  if (!approval.data) throw new Error("SOL approval not found.");
  if (approval.data.status !== "pending") throw new Error("That SOL approval has already been resolved.");

  const run = await service.from("sol_runtime_runs").select("legacy_run_id").eq("id", approval.data.run_id).single();
  if (run.error) throw run.error;
  if (run.data.legacy_run_id) return resolveSolRuntimeReview(input);

  const task = await service.from("sol_runtime_tasks")
    .select("id,status,tool_name,workflow_name,output")
    .eq("id", approval.data.task_id)
    .single();
  if (task.error) throw task.error;
  if (task.data.status !== "waiting_for_approval") throw new Error(`Approval task is ${task.data.status}, not waiting for approval.`);

  const now = new Date().toISOString();
  const approvalUpdate = await service.from("sol_runtime_approvals").update({
    status: input.decision,
    resolved_at: now,
    resolved_by: input.userId,
    note: input.note?.trim() || null,
    decision: {
      action: input.decision === "approved" ? "approve" : input.decision === "rejected" ? "reject" : "changes_requested",
      note: input.note?.trim() || null,
      userId: input.userId
    }
  }).eq("id", input.reviewId).eq("status", "pending").select("id").maybeSingle();
  if (approvalUpdate.error) throw approvalUpdate.error;
  if (!approvalUpdate.data) throw new Error("That SOL approval changed before your decision was saved.");

  if (input.decision === "approved") {
    const existingOutput = object(task.data.output);
    const pureReviewGate = !task.data.tool_name && task.data.workflow_name === "runtime.review";
    if (pureReviewGate) {
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
      const unblock = await service.rpc("sol_runtime_unblock_tasks", { p_run_id: approval.data.run_id });
      if (unblock.error) throw unblock.error;
      await event({ runId: String(approval.data.run_id), taskId: String(task.data.id), eventType: "task.completed", message: "Human review gate approved and completed.", details: { approvalId: input.reviewId } });
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
    const repairKey = `repair_after_${String(task.data.id).replaceAll("-", "").slice(0, 12)}`;
    const currentOutput = object(task.data.output);
    const repair = await service.from("sol_runtime_tasks").insert({
      run_id: approval.data.run_id,
      task_key: repairKey,
      name: "Repair requested artifact",
      workflow_name: "brain.repair_from_review",
      status: "stalled",
      input: { reviewId: input.reviewId, note: input.note?.trim() || null, sourceTaskId: task.data.id },
      depends_on: [],
      permission: "write",
      environment: "production",
      max_attempts: 3,
      error_code: "PLANNER_REQUIRED",
      error_message: "Human changes were requested. The repair planner must create a concrete repair task graph before execution."
    });
    if (repair.error && repair.error.code !== "23505") throw repair.error;
    const updateTask = await service.from("sol_runtime_tasks").update({
      status: "repairing",
      output: { ...currentOutput, approvalId: input.reviewId, changesRequested: true, note: input.note?.trim() || null },
      worker_id: null,
      heartbeat_at: null,
      lease_expires_at: null
    }).eq("id", task.data.id).eq("status", "waiting_for_approval");
    if (updateTask.error) throw updateTask.error;
    await event({ runId: String(approval.data.run_id), taskId: String(task.data.id), eventType: "repair.created", message: "Changes requested. Run entered repair state and is waiting for a concrete repair plan.", details: { approvalId: input.reviewId, note: input.note?.trim() || null } });
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
    details: { approvalId: input.reviewId, userId: input.userId, note: input.note?.trim() || null }
  });
  if (input.decision !== "rejected") await reconcileRun(String(approval.data.run_id));
  return getSolRuntimeReview(input.reviewId);
}
