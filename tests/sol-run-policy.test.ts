import assert from "node:assert/strict";
import test from "node:test";
import {
  canSolRunRecoverWithoutUser,
  isSolRetryDue,
  isSolRunLeaseStale,
  isTransientSolFailure,
  SOL_RUN_LEASE_MS,
  solRetryDelayMs
} from "../src/sol-run-policy";

const NOW = Date.parse("2026-08-16T06:00:00.000Z");

test("running Sol work becomes stale after its explicit lease expires", () => {
  assert.equal(isSolRunLeaseStale({ status: "running", leaseExpiresAt: "2026-08-16T05:59:59.000Z" }, NOW), true);
  assert.equal(isSolRunLeaseStale({ status: "running", leaseExpiresAt: "2026-08-16T06:00:01.000Z" }, NOW), false);
  assert.equal(isSolRunLeaseStale({ status: "retrying", leaseExpiresAt: "2026-08-16T05:59:59.000Z" }, NOW), false);
});

test("heartbeat fallback detects an orphaned worker when no lease was stored", () => {
  const staleHeartbeat = new Date(NOW - SOL_RUN_LEASE_MS - 1).toISOString();
  const healthyHeartbeat = new Date(NOW - SOL_RUN_LEASE_MS + 1).toISOString();
  assert.equal(isSolRunLeaseStale({ status: "running", heartbeatAt: staleHeartbeat }, NOW), true);
  assert.equal(isSolRunLeaseStale({ status: "running", heartbeatAt: healthyHeartbeat }, NOW), false);
});

test("Sol retry backoff is bounded and grows between attempts", () => {
  assert.equal(solRetryDelayMs(1), 15_000);
  assert.equal(solRetryDelayMs(2), 30_000);
  assert.equal(solRetryDelayMs(3), 60_000);
  assert.ok(solRetryDelayMs(6) <= 10 * 60_000);
  assert.equal(solRetryDelayMs(99), solRetryDelayMs(6));
});

test("retry due logic handles missing past and future timestamps", () => {
  assert.equal(isSolRetryDue(null, NOW), true);
  assert.equal(isSolRetryDue("2026-08-16T05:59:59.000Z", NOW), true);
  assert.equal(isSolRetryDue("2026-08-16T06:00:01.000Z", NOW), false);
});

test("transient infrastructure failures are retryable but validation failures are not", () => {
  assert.equal(isTransientSolFailure("request timed out after 75 seconds"), true);
  assert.equal(isTransientSolFailure("503 upstream unavailable"), true);
  assert.equal(isTransientSolFailure("The exact approved script has not passed the theology checker."), false);
  assert.equal(isTransientSolFailure("The audio does not match the approved script."), false);
});

test("only context-free safe draft recipes are eligible for background recovery", () => {
  assert.equal(canSolRunRecoverWithoutUser("journey_automation_draft"), true);
  assert.equal(canSolRunRecoverWithoutUser("forge_carousel_stage"), true);
  assert.equal(canSolRunRecoverWithoutUser("pathway_audio_stage"), true);
  assert.equal(canSolRunRecoverWithoutUser("audio_to_youtube"), false);
  assert.equal(canSolRunRecoverWithoutUser("carousel_topic_pack"), false);
});
