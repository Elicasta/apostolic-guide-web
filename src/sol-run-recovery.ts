import "server-only";
import { recordStudioAudit } from "./studio-audit";
import { createServiceClient } from "./supabase";

export const SOL_RUN_LEASE_MS = 3 * 60 * 1000;
export const SOL_RUN_REQUEST_TIMEOUT_MS = 75 * 1000;

function timestamp(value: unknown) {
  if (typeof value !== "string" || !value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isSolRunLeaseStale(input: { status?: unknown; leaseExpiresAt?: unknown; heartbeatAt?: unknown; updatedAt?: unknown }, now = Date.now()) {
  if (input.status !== "running") return false;
  const lease = timestamp(input.leaseExpiresAt);
  if (lease != null) return now > lease;
  const heartbeat = timestamp(input.heartbeatAt) ?? timestamp(input.updatedAt);
  return heartbeat != null && now - heartbeat > SOL_RUN_LEASE_MS;
}

export function solRetryDelayMs(attemptCount: number) {
  const attempt = Math.max(1, Math.min(6, Math.round(attemptCount || 1)));
  return Math.min(10 * 60 * 1000, 15_000 * (2 ** (attempt - 1)));
}

export function isTransientSolFailure(message: string) {
  const value = message.toLowerCase();
  return /timeout|timed out|network|fetch failed|socket|econn|429|rate limit|502|503|504|temporar|unavailable|worker stopped|lease expired/.test(value);
}

export async function recoverStaleSolRuns() {
  const service = createServiceClient();
  if (!service) return { recovered: 0, failed: 0 };
  const result = await service.from("sol_operator_runs")
    .select("id,proposal_id,status,attempt_count,max_attempts,lease_expires_at,heartbeat_at,updated_at")
    .eq("status", "running")
    .order("updated_at", { ascending: true })
    .limit(50);
  if (result.error) throw result.error;
  let recovered = 0;
  let failed = 0;
  const now = Date.now();
  for (const row of result.data ?? []) {
    if (!isSolRunLeaseStale({ status: row.status, leaseExpiresAt: row.lease_expires_at, heartbeatAt: row.heartbeat_at, updatedAt: row.updated_at }, now)) continue;
    const attemptCount = Number(row.attempt_count) || 0;
    const maxAttempts = Math.max(1, Number(row.max_attempts) || 3);
    if (attemptCount < maxAttempts) {
      const nextRetryAt = new Date(now + solRetryDelayMs(attemptCount)).toISOString();
      const updated = await service.from("sol_operator_runs").update({
        status: "retrying",
        worker_id: null,
        lease_expires_at: null,
        next_retry_at: nextRetryAt,
        error: "Worker stopped reporting progress. Sol will retry this run automatically."
      }).eq("id", row.id).eq("status", "running");
      if (updated.error) throw updated.error;
      await service.from("sol_operator_events").insert({ run_id: row.id, proposal_id: row.proposal_id ?? null, event_type: "run.recovered", detail: { reason: "lease_expired", next_retry_at: nextRetryAt, attempt_count: attemptCount } });
      recovered += 1;
    } else {
      const completedAt = new Date(now).toISOString();
      const updated = await service.from("sol_operator_runs").update({
        status: "stalled",
        worker_id: null,
        lease_expires_at: null,
        error: "This run stopped reporting progress and exhausted automatic recovery. Review or retry it.",
        completed_at: completedAt
      }).eq("id", row.id).eq("status", "running");
      if (updated.error) throw updated.error;
      await service.from("sol_operator_events").insert({ run_id: row.id, proposal_id: row.proposal_id ?? null, event_type: "run.stalled", detail: { reason: "lease_expired", attempt_count: attemptCount } });
      failed += 1;
    }
  }
  return { recovered, failed };
}

export async function listRunnableSolRunIds(limit = 3) {
  const service = createServiceClient();
  if (!service) return [] as string[];
  const result = await service.from("sol_operator_runs")
    .select("id,status,next_retry_at,created_at")
    .in("status", ["queued", "retrying"])
    .order("created_at", { ascending: true })
    .limit(30);
  if (result.error) throw result.error;
  const now = Date.now();
  return (result.data ?? [])
    .filter((row) => row.status === "queued" || !row.next_retry_at || (timestamp(row.next_retry_at) ?? Infinity) <= now)
    .slice(0, Math.max(1, Math.min(6, limit)))
    .map((row) => String(row.id));
}

export async function retrySolRun(runId: string, actorUserId: string) {
  const service = createServiceClient();
  if (!service) throw new Error("Supabase service access is not configured.");
  const current = await service.from("sol_operator_runs").select("id,status,attempt_count,max_attempts").eq("id", runId).maybeSingle();
  if (current.error) throw current.error;
  if (!current.data) throw new Error("Sol run not found.");
  if (!["failed", "stalled", "retrying"].includes(String(current.data.status))) throw new Error("Only failed or stalled work can be retried.");
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
