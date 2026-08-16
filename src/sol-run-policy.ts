export const SOL_RUN_LEASE_MS = 3 * 60 * 1000;
export const SOL_RUN_REQUEST_TIMEOUT_MS = 75 * 1000;
export const SOL_QUEUED_STALE_MS = 20 * 60 * 1000;

export function solTimestamp(value: unknown) {
  if (typeof value !== "string" || !value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isSolRunLeaseStale(input: { status?: unknown; leaseExpiresAt?: unknown; heartbeatAt?: unknown; updatedAt?: unknown }, now = Date.now()) {
  if (input.status !== "running") return false;
  const lease = solTimestamp(input.leaseExpiresAt);
  if (lease != null) return now > lease;
  const heartbeat = solTimestamp(input.heartbeatAt) ?? solTimestamp(input.updatedAt);
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

export function canSolRunRecoverWithoutUser(recipeKey: unknown) {
  return recipeKey === "journey_automation_draft";
}

export function isSolRetryDue(nextRetryAt: unknown, now = Date.now()) {
  const retryAt = solTimestamp(nextRetryAt);
  return retryAt == null || retryAt <= now;
}
