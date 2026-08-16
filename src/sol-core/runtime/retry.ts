export type SolRetryPolicy = {
  maxAttempts: number;
  strategy: "fixed" | "exponential";
  baseDelayMs: number;
  maxDelayMs: number;
};

export function solRuntimeRetryDelayMs(policy: SolRetryPolicy, attempt: number) {
  const safeAttempt = Math.max(1, Math.floor(attempt));
  const base = Math.max(0, Math.floor(policy.baseDelayMs));
  const max = Math.max(base, Math.floor(policy.maxDelayMs));
  if (policy.strategy === "fixed") return Math.min(base, max);
  return Math.min(max, base * 2 ** Math.max(0, safeAttempt - 1));
}

export function solRuntimeRetryAt(policy: SolRetryPolicy, attempt: number, now = Date.now()) {
  return new Date(now + solRuntimeRetryDelayMs(policy, attempt)).toISOString();
}

export function isSolRuntimeRetryableCode(code: string) {
  return [
    "TIMEOUT",
    "NETWORK",
    "RATE_LIMIT",
    "DEPENDENCY_FAILURE",
    "TEMPORARY_UNAVAILABLE",
    "LEASE_EXPIRED"
  ].includes(code);
}
