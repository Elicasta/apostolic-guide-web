import assert from "node:assert/strict";
import test from "node:test";
import { solRunIdempotencyKey } from "../src/sol-core/runtime/idempotency";
import { deriveSolProgress } from "../src/sol-core/runtime/progress";
import { canTransitionRun, canTransitionTask, deriveSolRunStatus } from "../src/sol-core/runtime/state-machine";
import { runnableTaskIds, validateSolPlan } from "../src/sol-core/runtime/task-graph";
import { evaluateSolPermission } from "../src/sol-core/permissions/policy";
import type { SolPlan, SolTaskDefinition } from "../src/sol-core/types/runtime";

function task(id: string, dependsOn: string[] = []): SolTaskDefinition {
  return {
    id,
    name: id,
    tool: `test.${id}`,
    input: {},
    dependsOn,
    permission: "execute",
    retryPolicy: { maxAttempts: 3, strategy: "exponential", baseDelayMs: 100, maxDelayMs: 1000 },
    timeoutMs: 5000
  };
}

function plan(tasks: SolTaskDefinition[]): SolPlan {
  return { id: "plan_1", version: 1, goal: "test runtime", environment: "development", tasks };
}

test("task graph rejects missing dependencies and cycles", () => {
  assert.throws(() => validateSolPlan(plan([task("a", ["missing"])])), /missing task/);
  assert.throws(() => validateSolPlan(plan([task("a", ["b"]), task("b", ["a"])])), /cycle/);
  assert.equal(validateSolPlan(plan([task("a"), task("b", ["a"])] )).tasks.length, 2);
});

test("runnable task selection is deterministic and dependency aware", () => {
  const tasks = [
    { id: "a", dependsOn: [], status: "completed" as const },
    { id: "b", dependsOn: ["a"], status: "queued" as const },
    { id: "c", dependsOn: ["b"], status: "queued" as const },
    { id: "d", dependsOn: [], status: "retry_scheduled" as const, nextRetryAt: new Date(Date.now() + 60_000).toISOString() }
  ];
  assert.deepEqual(runnableTaskIds(tasks), ["b"]);
});

test("approval keeps overall progress below complete", () => {
  const progress = deriveSolProgress([
    { status: "completed" },
    { status: "completed" },
    { status: "waiting_for_approval", approvalRequired: true }
  ]);
  assert.equal(progress.executionPercent, 100);
  assert.equal(progress.overallPercent, 67);
  assert.equal(progress.waitingForApproval, true);
  assert.equal(progress.label, "Execution finished. Waiting for review.");
});

test("review approval can resume and complete but cannot complete early", () => {
  assert.equal(canTransitionTask("waiting_for_approval", "completed"), true);
  assert.equal(canTransitionTask("waiting_for_approval", "repairing"), true);
  assert.equal(canTransitionRun("waiting_for_approval", "completed"), true);
  assert.equal(canTransitionRun("running", "completed"), true);
  assert.equal(canTransitionTask("completed", "running"), false);

  assert.equal(deriveSolRunStatus("waiting_for_approval", ["completed", "queued"]), "running");
  assert.equal(deriveSolRunStatus("waiting_for_approval", ["completed", "completed"]), "completed");
  assert.equal(deriveSolRunStatus("running", ["completed", "verifying"]), "running");
  assert.equal(deriveSolRunStatus("running", ["failed", "blocked"]), "failed");
  assert.equal(deriveSolRunStatus("running", ["stalled", "blocked"]), "stalled");
});

test("idempotency identity is stable across object key order", () => {
  const first = solRunIdempotencyKey({ workflowKey: "apostolic.audio_to_youtube", workflowVersion: 1, environment: "production", identity: { slug: "god-is-one", hashes: { audio: "a", script: "s" } } });
  const second = solRunIdempotencyKey({ workflowKey: "apostolic.audio_to_youtube", workflowVersion: 1, environment: "production", identity: { hashes: { script: "s", audio: "a" }, slug: "god-is-one" } });
  const changed = solRunIdempotencyKey({ workflowKey: "apostolic.audio_to_youtube", workflowVersion: 1, environment: "production", identity: { slug: "god-is-one", hashes: { audio: "b", script: "s" } } });
  assert.equal(first, second);
  assert.notEqual(first, changed);
});

test("operating modes are authority policies", () => {
  assert.equal(evaluateSolPermission({ mode: "watch", permission: "read", environment: "production" }), "allow");
  assert.equal(evaluateSolPermission({ mode: "watch", permission: "write", environment: "production" }), "deny");
  assert.equal(evaluateSolPermission({ mode: "assist", permission: "write", environment: "production" }), "approval_required");
  assert.equal(evaluateSolPermission({ mode: "trusted", permission: "execute", environment: "production", workflowAllowlisted: true }), "allow");
  assert.equal(evaluateSolPermission({ mode: "trusted", permission: "publish", environment: "production", workflowAllowlisted: true }), "approval_required");
});
