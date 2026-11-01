/**
 * Provider authentication will not recover from retries with the same expired
 * token. Back off that one failure class; continue retrying transient errors.
 * The existing connection status is cleared whenever a new token is verified.
 */
export const INSTAGRAM_EXPIRED_TOKEN_BACKOFF_MS = 6 * 60 * 60 * 1000;

export function isInstagramExpiredTokenError(message: string | null | undefined): boolean {
  if (!message) return false;
  return /\b(?:session has expired|access token has expired|expired access token|token has expired|invalid or expired token)\b/i.test(message);
}

export function shouldDeferInstagramFeedSync(
  state: { last_error?: string | null; updated_at?: string | null } | null,
  now = Date.now()
): boolean {
  if (!state || !isInstagramExpiredTokenError(state.last_error)) return false;
  const updatedAt = Date.parse(state.updated_at ?? "");
  if (!Number.isFinite(updatedAt)) return false;
  const elapsed = now - updatedAt;
  return elapsed >= 0 && elapsed < INSTAGRAM_EXPIRED_TOKEN_BACKOFF_MS;
}
