import { evaluateSolPermission, environmentAllowsTool } from "../permissions/policy";
import type { SolToolRegistry } from "../tools/registry";
import type { SolToolContext } from "../tools/types";
import type { SolCondition } from "../types/runtime";
import type { SolVerifierRegistry } from "../verification/registry";
import { isSolRuntimeRetryableCode, solRuntimeRetryAt } from "./retry";
import { deriveSolRunStatus } from "./state-machine";
import type { SolRuntimeRunRecord, SolRuntimeStore, SolRuntimeTaskRecord } from "./store";

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

function object(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function valueAt(value: unknown, path?: string) {
  if (!path) return value;
  let current: unknown = value;
  for (const segment of path.split(".").filter(Boolean)) {
    if (Array.isArray(current) && /^\d+$/.test(segment)) current = current[Number(segment)];
    else if (current && typeof current === "object") current = (current as Record<string, unknown>)[segment];
    else return undefined;
  }
  return current;
}

function taskValue(tasks: SolRuntimeTaskRecord[], taskKey: string, path?: string) {
  const source = tasks.find((task) => task.taskKey === taskKey);
  return source ? valueAt(source.output, path) : undefined;
}

function evaluateCondition(condition: Record<string, unknown> | null, tasks: SolRuntimeTaskRecord[]) {
  if (!condition) return true;
  const typed = condition as unknown as SolCondition;
  const actual = taskValue(tasks, String(typed.task || ""), typed.path);
  if (typed.operator === "exists") return actual !== undefined && actual !== null;
  if (typed.operator === "truthy") return Boolean(actual);
  if (typed.operator === "falsy") return !actual;
  if (typed.operator === "not_equals") return actual !== typed.value;
  return actual === typed.value;
}

function resolveBindings(value: unknown, run: SolRuntimeRunRecord, tasks: SolRuntimeTaskRecord[], item?: unknown, index?: number): unknown {
  if (Array.isArray(value)) return value.map((entry) => resolveBindings(entry, run, tasks, item, index));
  if (!value || typeof value !== "object") return value;
  const source = value as Record<string, unknown>;
  const keys = Object.keys(source);
  if (keys.length === 1 && typeof source.$from === "string") {
    const ref = source.$from;
    if (ref.startsWith("run.input.")) return valueAt(run.input, ref.slice("run.input.".length));
    if (ref === "run.input") return run.input;
    const dot = ref.indexOf(".");
    return dot === -1 ? taskValue(tasks, ref) : taskValue(tasks, ref.slice(0, dot), ref.slice(dot + 1));
  }
  if (keys.length === 1 && source.$item === true) return item;
  if (keys.length === 1 && source.$index === true) return index;
  return Object.fromEntries(Object.entries(source).map(([key, entry]) => [key, resolveBindings(entry, run, tasks, item, index)]));
}

function approvalGranted(task: SolRuntimeTaskRecord) {
  return task.output.approvalGranted === true;
}

function artifactRows(output: Record<string, unknown>) {
  const rows = Array.isArray(output.artifacts) ? output.artifacts : [];
  return rows.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object" && !Array.isArray(row)));
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

    const taskSnapshot = await this.store.getTasks(task.runId);
    if (!evaluateCondition(task.condition, taskSnapshot)) {
      const skipped = await this.store.skipTask(task.id, this.options.workerId, "Condition evaluated false.");
      if (skipped) {
        await this.store.emit({ runId: task.runId, taskId: task.id, eventType: "task.skipped", message: `${task.name} skipped because its condition evaluated false.` });
        await this.store.unblockTasks(task.runId);
      }
      await this.reconcileRun(task.runId);
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
      await this.store.failTask(task.id, this.options.workerId, { status: "stalled", errorCode: "WORKFLOW_EXPANSION_REQUIRED", errorMessage: "Nested workflow tasks must be expanded by the Workflow Registry before persistence." });
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
      const latestTasks = await this.store.getTasks(task.runId);
      const baseContext: Omit<SolToolContext, "idempotencyKey"> = {
        runId: task.runId,
        taskId: task.id,
        attempt: attempt.attemptNumber,
        environment: task.environment,
        signal: controller.signal,
        emit: async (eventType, message, details) => this.store.emit({ runId: task.runId, taskId: task.id, eventType, message, details })
      };

      const executeOne = async (rawInput: unknown, idempotencyKey: string | null) => {
        const parsedInput = tool.inputSchema.parse(rawInput);
        const toolResult = await tool.execute(parsedInput, { ...baseContext, idempotencyKey });
        if (!toolResult.ok) throw Object.assign(new Error(toolResult.error.message), { solCode: toolResult.error.code, retryable: toolResult.error.retryable });
        const output = tool.outputSchema.parse(toolResult.data) as unknown as Record<string, unknown>;
        if (toolResult.observations && Object.keys(toolResult.observations).length) {
          await this.store.recordObservation({ runId: task.runId, taskId: task.id, source: tool.name, kind: "tool_result", payload: toolResult.observations });
        }
        return output;
      };

      let output: Record<string, unknown>;
      if (task.foreach) {
        const sourceTask = String(task.foreach.sourceTask || "");
        const outputPath = typeof task.foreach.outputPath === "string" ? task.foreach.outputPath : undefined;
        const source = taskValue(latestTasks, sourceTask, outputPath);
        if (!Array.isArray(source)) throw Object.assign(new Error(`Foreach source ${sourceTask}${outputPath ? `.${outputPath}` : ""} is not an array.`), { solCode: "INVALID_INPUT", retryable: false });
        const items: Record<string, unknown>[] = [];
        for (let index = 0; index < source.length; index += 1) {
          const resolved = resolveBindings(task.input, run, latestTasks, source[index], index);
          const itemOutput = await executeOne(resolved, task.idempotencyKey ? `${task.idempotencyKey}:${index}` : null);
          items.push(itemOutput);
        }
        output = { items, count: items.length };
      } else {
        const resolved = resolveBindings(task.input, run, latestTasks);
        output = await executeOne(resolved, task.idempotencyKey);
      }

      await this.store.emit({ runId: task.runId, taskId: task.id, eventType: "tool.completed", message: `${tool.name} completed.`, details: { attempt: attempt.attemptNumber } });

      if (task.verifierName) {
        if (!this.verifiers.has(task.verifierName)) {
          await this.store.failAttempt(attempt.id, { code: "VERIFIER_NOT_REGISTERED", message: `Verifier ${task.verifierName} is not registered.` });
          await this.handleFailure(task, "VERIFIER_NOT_REGISTERED", `Verifier ${task.verifierName} is not registered.`, false);
          return;
        }
        await this.store.emit({ runId: task.runId, taskId: task.id, eventType: "verification.started", message: `${task.verifierName} started.`, details: { verifier: task.verifierName } });
        const verification = await this.verifiers.get(task.verifierName)(output, { runId: task.runId, taskId: task.id });
        await this.store.recordObservation({ runId: task.runId, taskId: task.id, source: task.verifierName, kind: verification.passed ? "verification_passed" : "verification_failed", payload: { code: verification.code, message: verification.message, observations: verification.observations ?? {} } });
        if (!verification.passed) {
          await this.store.emit({ runId: task.runId, taskId: task.id, eventType: "verification.failed", message: verification.message, details: { code: verification.code, observations: verification.observations ?? {} } });
          await this.store.failAttempt(attempt.id, { code: verification.code, message: verification.message });
          await this.handleFailure(task, verification.code || "VERIFICATION_FAILURE", verification.message, isSolRuntimeRetryableCode(verification.code));
          return;
        }
        await this.store.emit({ runId: task.runId, taskId: task.id, eventType: "verification.passed", message: `${task.verifierName} passed.`, details: { observations: verification.observations ?? {} } });
      }

      const artifactIds: string[] = [];
      for (const artifact of artifactRows(output)) {
        const type = typeof artifact.type === "string" ? artifact.type : "runtime_output";
        const title = typeof artifact.title === "string" ? artifact.title : task.name;
        const location = typeof artifact.location === "string" ? artifact.location : `runtime://${task.runId}/${task.taskKey}`;
        const storageType = ["database", "file", "url", "external"].includes(String(artifact.storageType)) ? String(artifact.storageType) as "database" | "file" | "url" | "external" : "external";
        const verificationStatus = ["pending", "passed", "failed"].includes(String(artifact.verificationStatus)) ? String(artifact.verificationStatus) as "pending" | "passed" | "failed" : task.verifierName ? "passed" : "pending";
        const artifactId = await this.store.recordArtifact({ runId: task.runId, taskId: task.id, type, title, storageType, location, metadata: object(artifact.metadata), verificationStatus });
        artifactIds.push(artifactId);
        await this.store.emit({ runId: task.runId, taskId: task.id, eventType: "artifact.created", message: `${title} registered.`, details: { artifactId, type, verificationStatus } });
      }
      if (artifactIds.length) output = { ...output, artifactIds };

      await this.store.completeAttempt(attempt.id, output);
      const completed = await this.store.completeTask(task.id, this.options.workerId, output);
      if (!completed) throw new Error("Task lease was lost before completion could be persisted.");
      await this.store.emit({ runId: task.runId, taskId: task.id, eventType: "task.completed", message: `${task.name} completed.`, details: { attempt: attempt.attemptNumber } });
      await this.store.unblockTasks(task.runId);
      await this.reconcileRun(task.runId);
    } catch (error) {
      const record = error as Error & { solCode?: string; retryable?: boolean };
      const failure = { code: record.solCode || errorRecord(error).code, message: error instanceof Error ? error.message : String(error || "SOL tool failed.") };
      try { await this.store.failAttempt(attempt.id, failure); } catch {}
      await this.handleFailure(task, failure.code, failure.message, record.retryable === true || failure.code === "TIMEOUT" || isSolRuntimeRetryableCode(failure.code));
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
    const next = deriveSolRunStatus(run.status, tasks.map((task) => task.status));

    if (next !== run.status) {
      await this.store.updateRunStatus(runId, next);
      await this.store.emit({ runId, eventType: next === "completed" ? "run.completed" : next === "failed" ? "run.failed" : `run.${next}`, message: `Run is ${next.replaceAll("_", " ")}.`, details: { previousStatus: run.status } });
    }
  }
}
