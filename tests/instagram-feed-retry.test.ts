import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  INSTAGRAM_EXPIRED_TOKEN_BACKOFF_MS,
  isInstagramExpiredTokenError,
  shouldDeferInstagramFeedSync
} from "../src/instagram-feed-retry";

const NOW = Date.parse("2026-10-20T23:00:00Z");

test("expired Meta token errors are treated as reconnect-required", () => {
  assert.equal(isInstagramExpiredTokenError("Error validating access token: Session has expired on Monday."), true);
  assert.equal(isInstagramExpiredTokenError("Access token has expired."), true);
  assert.equal(isInstagramExpiredTokenError("Invalid or expired token"), true);
  assert.equal(isInstagramExpiredTokenError("Rate limit reached"), false);
  assert.equal(isInstagramExpiredTokenError("Meta request failed (500)."), false);
  assert.equal(isInstagramExpiredTokenError(null), false);
});

test("known-expired token cools down without suppressing retryable failures", () => {
  const error = "Error validating access token: Session has expired";
  const current = { last_error: error, updated_at: new Date(NOW - 30 * 60 * 1000).toISOString() };
  assert.equal(shouldDeferInstagramFeedSync(current, NOW), true);
  assert.equal(shouldDeferInstagramFeedSync({
    ...current, updated_at: new Date(NOW - INSTAGRAM_EXPIRED_TOKEN_BACKOFF_MS).toISOString()
  }, NOW), false);
  assert.equal(shouldDeferInstagramFeedSync({ last_error: "Meta request failed (502)", updated_at: current.updated_at }, NOW), false);
  assert.equal(shouldDeferInstagramFeedSync({ last_error: null, updated_at: current.updated_at }, NOW), false);
  assert.equal(shouldDeferInstagramFeedSync({ last_error: error, updated_at: "nonsense" }, NOW), false);
  assert.equal(shouldDeferInstagramFeedSync({ last_error: error, updated_at: new Date(NOW + 60_000).toISOString() }, NOW), false);
});

test("cron keeps auth gating and persistent health error on deferred requests", () => {
  const route = readFileSync("app/api/cron/instagram-feed-sync/route.ts", "utf8");
  const authPosition = route.indexOf("if (!authorized(request))");
  const throttlePosition = route.indexOf("shouldDeferInstagramFeedSync(previous.data)");
  assert.ok(authPosition >= 0 && throttlePosition > authPosition, "the cooldown may run only after cron authorization");
  assert.match(route, /reconnectRequired:\s*true/);
  assert.match(route, /recordSyncState\(null\)/);
  assert.match(route, /recordSyncState\(message\)/);
});
