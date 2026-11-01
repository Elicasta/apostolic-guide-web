import "server-only";
import { recordStudioAudit } from "./studio-audit";
import {
  canSolRunRecoverWithoutUser,
  isSolRetryDue,
  isSolRunLeaseStale,
  SOL_QUEUED_STALE_MS,
  solRetryDelayMs,
  solTimestamp
} from "./sol-run-policy";
import { createServiceClient } from "./supabase";

export {
  canSolRunRecoverWithoutUser,
  isSolRetryDue,
  isSolRunLeaseStale,
  isTransientSolFailure,
  SOL_QUEUED_STALE_MS,
  SOL_RUN_LEASE_MS,
  SOL_RUN_REQUEST_TIMEOUT_MS,
  solRetryDelayMs,
  solTimestamp
} from "./sol-run-policy";

export async function recoverStaleSolRuns() {
  const service = createServiceClient();
  if (!service) return { recovered: 0, stalled: 0 };
  const result = await service.from("sol_operator_runs")
    .select("id,proposal_id,recipe_key,status,attempt_count,max_attempts,next_retry_at,lease_expires_at,heartbeat_at,created_at,updated_at")
    .in("status", ["queued", "running", "retrying"])
    .order("updated_at", { ascending: true })
    .limit(80);
  if (result.error) throw result.error;
  let recovered = 0;
  let stalled = 0;
  const now = Date.now();
  for (const row of result.data ?? []) {
    const queuedSince = solTimestamp(row.created_at) ?? now;
    const staleRunning = isSolRunLeaseStale({ status: row.status, leaseExpiresAt: row.lease_expires_at, heartbeatAt: row.heartbeat_at, updatedAt: row.updated_at }, now);
    const staleQueued = row.status === "queued" && now - queuedSince > SOL_QUEUED_STALE_MS;
    const dueRetry = row.status === "retrying" && isSolRetryDue(row.next_retry_at, now);
    if (!staleRunning && !staleQueued && !dueRetry) continue;

    const attemptCount = Number(row.attempt_count) || 0;
    const maxAttempts = Math.max(1, Number(row.max_attempts) || 3);
    const automatic = canSolRunRecoverWithoutUser(row.recipe_key) && attemptCount < maxAttempts;
    if (automatic) {
      if (row.status === "retrying") {
        recovered += 1;
        continue;
      }
      const nextRetryAt = new Date(now + solRetryDelayMs(Math.max(1, attemptCount))).toISOString();
      const updated = await service.from("sol_operator_runs").update({
        status: "retrying",
        worker_id: null,
        lease_expires_at: null,
        next_retry_at: nextRetryAt,
        error: "Worker stopped reporting progress. Sol will retry this safe draft automatically."
      }).eq("id", row.id).in("status", ["queued", "running"]);
      if (updated.error) throw updated.error;
      await service.from("sol_operator_events").insert({
        run_id: row.id,
        proposal_id: row.proposal_id ?? null,
        event_type: "run.recovered",
        detail: { reason: staleRunning ? "lease_expired" : "queue_orphaned", next_retry_at: nextRetryAt, attempt_count: attemptCount }
      });
      recovered += 1;
      continue;
    }

    const completedAt = new Date(now).toISOString();
    const updated = await service.from("sol_operator_runs").update({
      status: "stalled",
      worker_id: null,
      lease_expires_at: null,
      next_retry_at: null,
      error: canSolRunRecoverWithoutUser(row.recipe_key)
        ? "This safe draft exhausted automatic recovery. Review or retry it."
        : "The worker stopped before this run finished. This recipe needs an authenticated Studio session, so Sol stopped safely instead of pretending it was still running. Use Retry when you are ready.",
      completed_at: completedAt
    }).eq("id", row.id).in("status", ["queued", "running", "retrying"]);
    if (updated.error) throw updated.error;
    await service.from("sol_operator_events").insert({
      run_id: row.id,
      proposal_id: row.proposal_id ?? null,
      event_type: "run.stalled",
      detail: {
        reason: dueRetry ? "retry_requires_user_context" : staleRunning ? "lease_expired" : "queue_orphaned",
        attempt_count: attemptCount,
        requires_user_context: !canSolRunRecoverWithoutUser(row.recipe_key)
      }
    });
    stalled += 1;
  }
  return { recovered, stalled };
}

export async function listRunnableSolRunIds(limit = 3, automaticOnly = false) {
  const service = createServiceClient();
  if (!service) return [] as string[];
  const result = await service.from("sol_operator_runs")
    .select("id,recipe_key,status,next_retry_at,created_at")
    .in("status", ["queued", "retrying"])
    .order("created_at", { ascending: true })
    .limit(30);
  if (result.error) throw result.error;
  const now = Date.now();
  return (result.data ?? [])
    .filter((row) => (!automaticOnly || canSolRunRecoverWithoutUser(row.recipe_key)) && (row.status === "queued" || isSolRetryDue(row.next_retry_at, now)))
    .slice(0, Math.max(1, Math.min(6, limit)))
    .map((row) => String(row.id));
}

export async function retrySolRun(runId: string, actorUserId: string) {
  const service = createServiceClient();
  if (!service) throw new Error("Supabase service access is not configured.");
  const current = await service.from("sol_operator_runs").select("id,status,attempt_count,max_attempts").eq("id", runId).maybeSingle();
  if (current.error) throw current.error;
  if (!current.data) throw new Error("Sol run not found.");
  if (!["failed", "stalled", "retrying"].includes(String(current.data.status))) throw new Error("Only failed, stalled, or retrying work can be retried.");
  const updated = await service.from("sol_operator_runs").update({
    status: "queued",
    error: null,
    completed_at: null,
    next_retry_at: null,
    lease_expires_at: null,
    heartbeat_at: null,
    worker_id: null
  }).eq("id", runId).in("status", ["failed", "stalled", "retrying"]);
  if (updated.error) throw updated.error;
  await service.from("sol_operator_events").insert({ run_id: runId, event_type: "run.retry_requested", detail: { actor_user_id: actorUserId } });
  await recordStudioAudit({ actorUserId, action: "sol.run_retry_requested", resourceType: "sol_run", resourceId: runId });
}

export async function cancelSolRunV3(runId: string, actorUserId: string) {
  const service = createServiceClient();
  if (!service) throw new Error("Supabase service access is not configured.");
  const current = await service.from("sol_operator_runs").select("id,status").eq("id", runId).maybeSingle();
  if (current.error) throw current.error;
  if (!current.data) throw new Error("Sol run not found.");
  if (!["queued", "running", "retrying", "waiting_review"].includes(String(current.data.status))) throw new Error("Only active or waiting-review work can be cancelled.");
  const result = await service.from("sol_operator_runs").update({
    status: "cancelled",
    current_step: null,
    completed_at: new Date().toISOString(),
    next_retry_at: null,
    lease_expires_at: null,
    worker_id: null
  }).eq("id", runId).in("status", ["queued", "running", "retrying", "waiting_review"]);
  if (result.error) throw result.error;
  await service.from("sol_operator_events").insert({ run_id: runId, event_type: "run.cancelled", detail: { actor_user_id: actorUserId, prior_status: current.data.status } });
  await recordStudioAudit({ actorUserId, action: "sol.run_cancelled", resourceType: "sol_run", resourceId: runId, metadata: { prior_status: current.data.status } });
}
