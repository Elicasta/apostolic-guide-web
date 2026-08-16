import "server-only";
import { createServiceClient } from "./supabase";

function service() {
  const db = createServiceClient();
  if (!db) throw new Error("SOL Runtime database is not configured.");
  return db;
}

async function emit(runId: string, eventType: string, message: string, details: Record<string, unknown> = {}) {
  const result = await service().from("sol_runtime_events").insert({ run_id: runId, event_type: eventType, message, details });
  if (result.error) throw result.error;
}

export async function cancelSolRuntimeRun(runId: string, userId: string) {
  const db = service();
  const run = await db.from("sol_runtime_runs").select("id,status").eq("id", runId).maybeSingle();
  if (run.error) throw run.error;
  if (!run.data) throw new Error("Runtime run not found.");
  if (["completed","cancelled","superseded"].includes(run.data.status)) return { changed: false, status: run.data.status };
  const now = new Date().toISOString();
  const runUpdate = await db.from("sol_runtime_runs").update({ status: "cancelled", completed_at: now }).eq("id", runId).not("status", "in", "(completed,cancelled,superseded)");
  if (runUpdate.error) throw runUpdate.error;
  const taskUpdate = await db.from("sol_runtime_tasks").update({ status: "cancelled", completed_at: now, worker_id: null, heartbeat_at: null, lease_expires_at: null }).eq("run_id", runId).in("status", ["pending","blocked","queued","waiting","waiting_for_approval","retry_scheduled","repairing","failed","stalled"]);
  if (taskUpdate.error) throw taskUpdate.error;
  const approvals = await db.from("sol_runtime_approvals").update({ status: "expired", resolved_at: now, resolved_by: userId, note: "Run cancelled." }).eq("run_id", runId).eq("status", "pending");
  if (approvals.error) throw approvals.error;
  await emit(runId, "run.cancelled", "Run cancelled. Existing outputs and audit history were preserved.", { userId });
  return { changed: true, status: "cancelled" };
}

export async function resumeSolRuntimeRun(runId: string, userId: string) {
  const db = service();
  const run = await db.from("sol_runtime_runs").select("id,status").eq("id", runId).maybeSingle();
  if (run.error) throw run.error;
  if (!run.data) throw new Error("Runtime run not found.");
  if (["completed","cancelled","superseded"].includes(run.data.status)) throw new Error(`A ${run.data.status} run cannot be resumed. Start a new execution generation instead.`);
  const tasks = await db.from("sol_runtime_tasks").select("id,status,attempt_count,max_attempts").eq("run_id", runId).in("status", ["failed","stalled"]);
  if (tasks.error) throw tasks.error;
  let queued = 0;
  for (const task of tasks.data ?? []) {
    if (Number(task.attempt_count) >= Number(task.max_attempts)) continue;
    const update = await db.from("sol_runtime_tasks").update({ status: "queued", completed_at: null, worker_id: null, heartbeat_at: null, lease_expires_at: null, next_retry_at: null, error_code: null, error_message: null }).eq("id", task.id).in("status", ["failed","stalled"]);
    if (update.error) throw update.error;
    queued += 1;
  }
  const unblock = await db.rpc("sol_runtime_unblock_tasks", { p_run_id: runId });
  if (unblock.error) throw unblock.error;
  const status = queued || Number(unblock.data || 0) ? "queued" : run.data.status;
  if (status === "queued") {
    const runUpdate = await db.from("sol_runtime_runs").update({ status: "queued", completed_at: null }).eq("id", runId);
    if (runUpdate.error) throw runUpdate.error;
  }
  await emit(runId, "run.resumed", queued ? "Failed or stalled tasks were requeued within their retry budget." : "Resume checked the task graph. No failed task had retry budget remaining.", { userId, queued, unblocked: Number(unblock.data || 0) });
  return { queued, unblocked: Number(unblock.data || 0), status };
}
