import { evaluateSolPermission, environmentAllowsTool } from "../permissions/policy";
import type { SolToolRegistry } from "../tools/registry";
import type { SolVerifierRegistry } from "../verification/registry";
import { isSolRuntimeRetryableCode, solRuntimeRetryAt } from "./retry";
import type { SolRuntimeStore, SolRuntimeTaskRecord } from "./store";

export type SolRuntimeExecutorOptions = {
  workerId: string;
  leaseSeconds?: number;
  heartbeatMs?: number;
  workflowAllowlisted?: (workflowKey: string | null, workflowVersion: number | null) => boolean;
};

function errorRecord(error: unknown) {
  if (error instanceof Error) return { code: error.name === "AbortError" ? "TIMEOUT" : "UNKNOWN", message: error.message || "SOL tool failed." };
  return { code: "UNKNOWN", message: String(error || "SOL tool failed.") };
}

function approvalGranted(task: SolRuntimeTaskRecord) {
  return task.output.approvalGranted === true;
}

export class SolRuntimeExecutor {
  private readonly leaseSeconds: number;
  private readonly heartbeatMs: number;

  constructor(
    private readonly store: SolRuntimeStore,
    private readonly tools: SolToolRegistry,
    private readonly verifiers: SolVerifierRegistry,
    private readonly options: SolRuntimeExecutorOptions
  ) {
    this.leaseSeconds = Math.max(15, options.leaseSeconds ?? 90);
    this.heartbeatMs = Math.max(5000, Math.min((this.leaseSeconds * 1000) / 3, options.heartbeatMs ?? 20000));
  }

  async executeClaimedTask(task: SolRuntimeTaskRecord) {
    const run = await this.store.getRun(task.runId);
    if (!run) {
      await this.store.failTask(task.id, this.options.workerId, { status: "failed", errorCode: "RUN_NOT_FOUND", errorMessage: "Parent runtime run no longer exists." });
      return;
    }
    if (["cancelled", "superseded", "completed", "failed"].includes(run.status)) {
      await this.store.failTask(task.id, this.options.workerId, { status: "stalled", errorCode: "RUN_NOT_EXECUTABLE", errorMessage: `Parent run is ${run.status}.` });
      return;
    }

    const granted = approvalGranted(task);
    if (task.approvalType && !granted) {
      const approvalId = await this.store.waitForApproval(task, { type: task.approvalType, requestedAction: `${task.name} requires ${task.approvalType} approval.` });
      await this.store.emit({ runId: task.runId, taskId: task.id, eventType: "approval.requested", message: `${task.name} is waiting for approval.`, details: { approvalId, type: task.approvalType } });
      await this.reconcileRun(task.runId);
      return;
    }

    if (!task.toolName) {
      if (task.approvalType && granted && task.workflowName === "runtime.review") {
        const output = { ...task.output, approved: true };
        const completed = await this.store.completeTask(task.id, this.options.workerId, output);
        if (!completed) throw new Error("Review gate lease was lost before approval completion could be persisted.");
        await this.store.emit({ runId: task.runId, taskId: task.id, eventType: "task.completed", message: `${task.name} approval gate completed.`, details: { approvalType: task.approvalType } });
        await this.store.unblockTasks(task.runId);
        await this.reconcileRun(task.runId);
        return;
      }
      await this.store.failTask(task.id, this.options.workerId, { status: "stalled", errorCode: "WORKFLOW_EXPANSION_REQUIRED", errorMessage: "Nested workflow execution is not available in this runtime worker yet." });
      await this.reconcileRun(task.runId);
      return;
    }

    let tool;
    try {
      tool = this.tools.get(task.toolName);
    } catch (error) {
      const failure = errorRecord(error);
      await this.store.failTask(task.id, this.options.workerId, { status: "stalled", errorCode: "TOOL_NOT_REGISTERED", errorMessage: failure.message });
      await this.store.emit({ runId: task.runId, taskId: task.id, eventType: "tool.failed", message: failure.message, details: { tool: task.toolName, code: "TOOL_NOT_REGISTERED" } });
      await this.reconcileRun(task.runId);
      return;
    }

    if (!environmentAllowsTool(tool.supportedEnvironments, task.environment)) {
      await this.store.failTask(task.id, this.options.workerId, { status: "failed", errorCode: "ENVIRONMENT_DENIED", errorMessage: `${tool.name} is not allowed in ${task.environment}.` });
      await this.reconcileRun(task.runId);
      return;
    }
    if (!tool.permissions.includes(task.permission)) {
      await this.store.failTask(task.id, this.options.workerId, { status: "failed", errorCode: "PERMISSION_MISMATCH", errorMessage: `${tool.name} does not declare ${task.permission} authority.` });
      await this.reconcileRun(task.runId);
      return;
    }

    const workflowAllowlisted = this.options.workflowAllowlisted?.(run.workflowKey, run.workflowVersion) ?? false;
    const permission = evaluateSolPermission({ mode: run.mode, permission: task.permission, environment: run.environment, workflowAllowlisted });
    const permissionApprovalType = ["publish", "deploy", "delete", "financial", "security"].includes(task.permission)
      ? task.permission as "publish" | "deploy" | "delete" | "financial" | "security"
      : null;
    if (permission === "deny") {
      await this.store.failTask(task.id, this.options.workerId, { status: "failed", errorCode: "PERMISSION_DENIED", errorMessage: `${run.mode} mode does not allow ${task.permission} execution.` });
      await this.store.emit({ runId: task.runId, taskId: task.id, eventType: "task.denied", message: "Runtime permission policy denied execution.", details: { mode: run.mode, permission: task.permission } });
      await this.reconcileRun(task.runId);
      return;
    }
    if ((permission === "approval_required" || permissionApprovalType) && !granted) {
      const type = permissionApprovalType ?? "review";
      const approvalId = await this.store.waitForApproval(task, { type, requestedAction: `${task.name} requires ${type} approval.` });
      await this.store.emit({ runId: task.runId, taskId: task.id, eventType: "approval.requested", message: `${task.name} is waiting for approval.`, details: { approvalId, type } });
      await this.reconcileRun(task.runId);
      return;
    }

    const attempt = await this.store.startAttempt(task, this.options.workerId);
    await this.store.emit({ runId: task.runId, taskId: task.id, eventType: "task.started", message: `${task.name} started.`, details: { tool: tool.name, attempt: attempt.attemptNumber } });
    await this.store.emit({ runId: task.runId, taskId: task.id, eventType: "tool.started", message: `${tool.name} started.`, details: { attempt: attempt.attemptNumber } });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), task.timeoutMs);
    const heartbeat = setInterval(() => {
      void this.store.heartbeat(task.id, this.options.workerId, this.leaseSeconds).catch(() => undefined);
    }, this.heartbeatMs);

    try {
      const parsedInput = tool.inputSchema.parse(task.input);
      const toolResult = await tool.execute(parsedInput, {
        runId: task.runId,
        taskId: task.id,
        attempt: attempt.attemptNumber,
        environment: task.environment,
        idempotencyKey: task.idempotencyKey,
        signal: controller.signal,
        emit: async (eventType, message, details) => this.store.emit({ runId: task.runId, taskId: task.id, eventType, message, details })
      });
      if (!toolResult.ok) {
        const error = toolResult.error;
        await this.store.failAttempt(attempt.id, { code: error.code, message: error.message });
        await this.handleFailure(task, error.code, error.message, error.retryable);
        return;
      }
      const output = tool.outputSchema.parse(toolResult.data) as unknown as Record<string, unknown>;
      await this.store.emit({ runId: task.runId, taskId: task.id, eventType: "tool.completed", message: `${tool.name} completed.`, details: { attempt: attempt.attemptNumber } });

      if (task.verifierName) {
        if (!this.verifiers.has(task.verifierName)) {
          await this.store.failAttempt(attempt.id, { code: "VERIFIER_NOT_REGISTERED", message: `Verifier ${task.verifierName} is not registered.` });
          await this.handleFailure(task, "VERIFIER_NOT_REGISTERED", `Verifier ${task.verifierName} is not registered.`, false);
          return;
        }
        await this.store.emit({ runId: task.runId, taskId: task.id, eventType: "verification.started", message: `${task.verifierName} started.`, details: { verifier: task.verifierName } });
        const verification = await this.verifiers.get(task.verifierName)(output, { runId: task.runId, taskId: task.id });
        if (!verification.passed) {
          await this.store.emit({ runId: task.runId, taskId: task.id, eventType: "verification.failed", message: verification.message, details: { code: verification.code, observations: verification.observations ?? {} } });
          await this.store.failAttempt(attempt.id, { code: verification.code, message: verification.message });
          await this.handleFailure(task, verification.code || "VERIFICATION_FAILURE", verification.message, isSolRuntimeRetryableCode(verification.code));
          return;
        }
        await this.store.emit({ runId: task.runId, taskId: task.id, eventType: "verification.passed", message: `${task.verifierName} passed.`, details: { observations: verification.observations ?? {} } });
      }

      await this.store.completeAttempt(attempt.id, output);
      const completed = await this.store.completeTask(task.id, this.options.workerId, output);
      if (!completed) throw new Error("Task lease was lost before completion could be persisted.");
      await this.store.emit({ runId: task.runId, taskId: task.id, eventType: "task.completed", message: `${task.name} completed.`, details: { attempt: attempt.attemptNumber } });
      await this.store.unblockTasks(task.runId);
      await this.reconcileRun(task.runId);
    } catch (error) {
      const failure = errorRecord(error);
      try { await this.store.failAttempt(attempt.id, failure); } catch {}
      await this.handleFailure(task, failure.code, failure.message, failure.code === "TIMEOUT" || isSolRuntimeRetryableCode(failure.code));
    } finally {
      clearTimeout(timeout);
      clearInterval(heartbeat);
    }
  }

  private async handleFailure(task: SolRuntimeTaskRecord, code: string, message: string, retryable: boolean) {
    const canRetry = retryable && task.attemptCount < task.maxAttempts;
    if (canRetry) {
      const nextRetryAt = solRuntimeRetryAt({
        maxAttempts: task.maxAttempts,
        strategy: task.retryStrategy,
        baseDelayMs: task.retryBaseDelayMs,
        maxDelayMs: task.retryMaxDelayMs
      }, task.attemptCount);
      await this.store.scheduleRetry(task.id, this.options.workerId, { nextRetryAt, errorCode: code, errorMessage: message });
      await this.store.emit({ runId: task.runId, taskId: task.id, eventType: "retry.scheduled", message: `${task.name} will retry.`, details: { code, nextRetryAt, attempt: task.attemptCount, maxAttempts: task.maxAttempts } });
    } else {
      const status = code === "UNKNOWN" || code === "VERIFIER_NOT_REGISTERED" ? "stalled" : "failed";
      await this.store.failTask(task.id, this.options.workerId, { status, errorCode: code, errorMessage: message });
      await this.store.emit({ runId: task.runId, taskId: task.id, eventType: status === "stalled" ? "task.stalled" : "tool.failed", message, details: { code, attempt: task.attemptCount, maxAttempts: task.maxAttempts } });
    }
    await this.reconcileRun(task.runId);
  }

  async reconcileRun(runId: string) {
    const run = await this.store.getRun(runId);
    if (!run || ["cancelled", "superseded"].includes(run.status)) return;
    const tasks = await this.store.getTasks(runId);
    if (!tasks.length) return;
    const states = new Set(tasks.map((task) => task.status));
    let next = run.status;
    if (states.has("waiting_for_approval")) next = "waiting_for_approval";
    else if (states.has("repairing")) next = "repairing";
    else if (states.has("running")) next = "running";
    else if (states.has("retry_scheduled")) next = "retrying";
    else if (states.has("queued") || states.has("blocked") || states.has("pending") || states.has("waiting")) next = tasks.some((task) => task.status === "completed") ? "running" : "queued";
    else if (states.has("stalled")) next = "stalled";
    else if (states.has("failed")) next = "failed";
    else if (tasks.every((task) => ["completed", "skipped"].includes(task.status))) next = "completed";

    if (next !== run.status) {
      await this.store.updateRunStatus(runId, next);
      await this.store.emit({ runId, eventType: next === "completed" ? "run.completed" : next === "failed" ? "run.failed" : `run.${next}`, message: `Run is ${next.replaceAll("_", " ")}.`, details: { previousStatus: run.status } });
    }
  }
}
