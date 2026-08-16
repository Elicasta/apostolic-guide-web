import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { SolRuntimeExecutor } from "../src/sol-core/runtime/executor";
import type { SolRuntimeAttemptRecord, SolRuntimeRunRecord, SolRuntimeStore, SolRuntimeTaskRecord } from "../src/sol-core/runtime/store";
import { solRuntimeRetryDelayMs } from "../src/sol-core/runtime/retry";
import { SolToolRegistry } from "../src/sol-core/tools/registry";
import type { SolTool } from "../src/sol-core/tools/types";
import { SolVerifierRegistry } from "../src/sol-core/verification/registry";

class MemoryStore implements SolRuntimeStore {
  run: SolRuntimeRunRecord;
  tasks: SolRuntimeTaskRecord[];
  events: Array<{ eventType: string; message: string }> = [];
  approvals: string[] = [];
  retries: string[] = [];
  attempts = new Map<string, { status: string }>();

  constructor(run: SolRuntimeRunRecord, tasks: SolRuntimeTaskRecord[]) {
    this.run = run;
    this.tasks = tasks;
  }

  async claimTasks() { return []; }
  async getRun(runId: string) { return runId === this.run.id ? this.run : null; }
  async getTasks() { return this.tasks; }
  async startAttempt(task: SolRuntimeTaskRecord): Promise<SolRuntimeAttemptRecord> {
    const id = `attempt_${task.attemptCount}`;
    this.attempts.set(id, { status: "running" });
    return { id, attemptNumber: task.attemptCount };
  }
  async completeAttempt(id: string) { this.attempts.set(id, { status: "completed" }); }
  async failAttempt(id: string) { this.attempts.set(id, { status: "failed" }); }
  async emit(input: { eventType: string; message: string }) { this.events.push(input); }
  async heartbeat() { return true; }
  async completeTask(taskId: string, _workerId: string, output: Record<string, unknown>) {
    const task = this.tasks.find((item) => item.id === taskId);
    if (!task) return false;
    task.status = "completed";
    task.output = output;
    task.workerId = null;
    return true;
  }
  async scheduleRetry(taskId: string, _workerId: string, input: { nextRetryAt: string }) {
    const task = this.tasks.find((item) => item.id === taskId);
    if (!task) return false;
    task.status = "retry_scheduled";
    task.workerId = null;
    this.retries.push(input.nextRetryAt);
    return true;
  }
  async failTask(taskId: string, _workerId: string, input: { status: "failed" | "stalled" }) {
    const task = this.tasks.find((item) => item.id === taskId);
    if (!task) return false;
    task.status = input.status;
    task.workerId = null;
    return true;
  }
  async waitForApproval(task: SolRuntimeTaskRecord) {
    const id = "approval_1";
    task.status = "waiting_for_approval";
    task.workerId = null;
    this.approvals.push(id);
    return id;
  }
  async unblockTasks() { return 0; }
  async updateRunStatus(_runId: string, status: SolRuntimeRunRecord["status"]) { this.run.status = status; }
  async releaseExpiredLeases() { return { recovered: 0, stalled: 0 }; }
}

function run(overrides: Partial<SolRuntimeRunRecord> = {}): SolRuntimeRunRecord {
  return {
    id: "run_1",
    goal: "test",
    workflowKey: "test.workflow",
    workflowVersion: 1,
    environment: "development",
    mode: "trusted",
    status: "running",
    input: {},
    output: {},
    ...overrides
  };
}

function task(overrides: Partial<SolRuntimeTaskRecord> = {}): SolRuntimeTaskRecord {
  return {
    id: "task_1",
    runId: "run_1",
    taskKey: "fetch",
    name: "Fetch",
    toolName: "test.read",
    workflowName: null,
    status: "running",
    input: { value: "hello" },
    output: {},
    dependsOn: [],
    permission: "read",
    environment: "development",
    idempotencyKey: null,
    approvalType: null,
    verifierName: null,
    retryStrategy: "exponential",
    attemptCount: 1,
    maxAttempts: 3,
    retryBaseDelayMs: 100,
    retryMaxDelayMs: 1000,
    timeoutMs: 5000,
    workerId: "worker_1",
    ...overrides
  };
}

function readTool(execute?: SolTool<{ value: string }, { value: string }>["execute"]): SolTool<{ value: string }, { value: string }> {
  return {
    name: "test.read",
    description: "test",
    inputSchema: z.object({ value: z.string() }),
    outputSchema: z.object({ value: z.string() }),
    permissions: ["read"],
    supportedEnvironments: ["development"],
    idempotency: "not_required",
    execute: execute ?? (async (input) => ({ ok: true, data: input }))
  };
}

test("runtime executor acts, verifies, persists, and completes the run", async () => {
  const currentTask = task({ verifierName: "value.present" });
  const store = new MemoryStore(run(), [currentTask]);
  const tools = new SolToolRegistry().register(readTool());
  const verifiers = new SolVerifierRegistry().register("value.present", async (value: unknown) => ({ passed: Boolean((value as { value?: string }).value) }));
  const executor = new SolRuntimeExecutor(store, tools, verifiers, { workerId: "worker_1" });
  await executor.executeClaimedTask(currentTask);
  assert.equal(currentTask.status, "completed");
  assert.equal(store.run.status, "completed");
  assert.equal(store.attempts.get("attempt_1")?.status, "completed");
  assert.ok(store.events.some((event) => event.eventType === "verification.passed"));
});

test("approval gate stops execution before the tool side effect", async () => {
  let executed = 0;
  const currentTask = task({ approvalType: "review" });
  const store = new MemoryStore(run({ mode: "trusted" }), [currentTask]);
  const tools = new SolToolRegistry().register(readTool(async (input) => { executed += 1; return { ok: true, data: input }; }));
  const executor = new SolRuntimeExecutor(store, tools, new SolVerifierRegistry(), { workerId: "worker_1" });
  await executor.executeClaimedTask(currentTask);
  assert.equal(executed, 0);
  assert.equal(currentTask.status, "waiting_for_approval");
  assert.equal(store.run.status, "waiting_for_approval");
  assert.deepEqual(store.approvals, ["approval_1"]);
});

test("retryable tool failure schedules deterministic retry", async () => {
  const currentTask = task({ attemptCount: 2, maxAttempts: 3 });
  const store = new MemoryStore(run(), [currentTask]);
  const tools = new SolToolRegistry().register(readTool(async () => ({ ok: false, error: { code: "NETWORK", message: "temporary", retryable: true } })));
  const executor = new SolRuntimeExecutor(store, tools, new SolVerifierRegistry(), { workerId: "worker_1" });
  await executor.executeClaimedTask(currentTask);
  assert.equal(currentTask.status, "retry_scheduled");
  assert.equal(store.run.status, "retrying");
  assert.equal(store.retries.length, 1);
  assert.equal(solRuntimeRetryDelayMs({ maxAttempts: 3, strategy: "exponential", baseDelayMs: 100, maxDelayMs: 1000 }, 2), 200);
});

test("unregistered tool stalls instead of pretending work ran", async () => {
  const currentTask = task({ toolName: "missing.tool" });
  const store = new MemoryStore(run(), [currentTask]);
  const executor = new SolRuntimeExecutor(store, new SolToolRegistry(), new SolVerifierRegistry(), { workerId: "worker_1" });
  await executor.executeClaimedTask(currentTask);
  assert.equal(currentTask.status, "stalled");
  assert.equal(store.run.status, "stalled");
});
