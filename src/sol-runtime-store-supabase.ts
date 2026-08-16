import "server-only";
import type { SolRunStatus, SolTaskStatus } from "./sol-core/types/runtime";
import type {
  SolRuntimeAttemptRecord,
  SolRuntimeRunRecord,
  SolRuntimeStore,
  SolRuntimeTaskRecord
} from "./sol-core/runtime/store";
import { createServiceClient } from "./supabase";

function obj(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function taskFromRow(row: Record<string, unknown>): SolRuntimeTaskRecord {
  return {
    id: String(row.id),
    runId: String(row.run_id),
    taskKey: String(row.task_key),
    name: String(row.name),
    toolName: row.tool_name ? String(row.tool_name) : null,
    workflowName: row.workflow_name ? String(row.workflow_name) : null,
    status: String(row.status) as SolTaskStatus,
    input: obj(row.input),
    output: obj(row.output),
    dependsOn: Array.isArray(row.depends_on) ? row.depends_on.map(String) : [],
    permission: String(row.permission) as SolRuntimeTaskRecord["permission"],
    environment: String(row.environment) as SolRuntimeTaskRecord["environment"],
    idempotencyKey: row.idempotency_key ? String(row.idempotency_key) : null,
    approvalType: row.approval_type ? String(row.approval_type) as SolRuntimeTaskRecord["approvalType"] : null,
    verifierName: row.verifier_name ? String(row.verifier_name) : null,
    retryStrategy: String(row.retry_strategy || "exponential") as "fixed" | "exponential",
    attemptCount: Number(row.attempt_count) || 0,
    maxAttempts: Math.max(1, Number(row.max_attempts) || 1),
    retryBaseDelayMs: Math.max(0, Number(row.retry_base_delay_ms) || 0),
    retryMaxDelayMs: Math.max(0, Number(row.retry_max_delay_ms) || 0),
    timeoutMs: Math.max(1, Number(row.timeout_ms) || 300000),
    workerId: row.worker_id ? String(row.worker_id) : null
  };
}

function runFromRow(row: Record<string, unknown>): SolRuntimeRunRecord {
  return {
    id: String(row.id),
    goal: String(row.goal),
    workflowKey: row.workflow_key ? String(row.workflow_key) : null,
    workflowVersion: row.workflow_version == null ? null : Number(row.workflow_version),
    environment: String(row.environment) as SolRuntimeRunRecord["environment"],
    mode: String(row.mode) as SolRuntimeRunRecord["mode"],
    status: String(row.status) as SolRunStatus,
    input: obj(row.input),
    output: obj(row.output)
  };
}

function serviceOrThrow() {
  const service = createServiceClient();
  if (!service) throw new Error("SOL Runtime database is not configured.");
  return service;
}

export class SupabaseSolRuntimeStore implements SolRuntimeStore {
  async claimTasks(workerId: string, limit: number, leaseSeconds: number) {
    const service = serviceOrThrow();
    const result = await service.rpc("sol_runtime_claim_tasks", {
      p_worker_id: workerId,
      p_limit: Math.max(1, Math.min(limit, 50)),
      p_lease_seconds: Math.max(15, leaseSeconds)
    });
    if (result.error) throw result.error;
    return (result.data ?? []).map((row: Record<string, unknown>) => taskFromRow(row));
  }

  async getRun(runId: string) {
    const service = serviceOrThrow();
    const result = await service.from("sol_runtime_runs").select("*").eq("id", runId).maybeSingle();
    if (result.error) throw result.error;
    return result.data ? runFromRow(result.data as Record<string, unknown>) : null;
  }

  async getTasks(runId: string) {
    const service = serviceOrThrow();
    const result = await service.from("sol_runtime_tasks").select("*").eq("run_id", runId).order("created_at", { ascending: true });
    if (result.error) throw result.error;
    return (result.data ?? []).map((row) => taskFromRow(row as Record<string, unknown>));
  }

  async startAttempt(task: SolRuntimeTaskRecord, workerId: string): Promise<SolRuntimeAttemptRecord> {
    const service = serviceOrThrow();
    const result = await service.from("sol_runtime_task_attempts").insert({
      run_id: task.runId,
      task_id: task.id,
      attempt_number: task.attemptCount,
      worker_id: workerId,
      status: "running",
      input: task.input
    }).select("id,attempt_number").single();
    if (result.error) throw result.error;
    return { id: String(result.data.id), attemptNumber: Number(result.data.attempt_number) };
  }

  async completeAttempt(attemptId: string, output: Record<string, unknown>) {
    const service = serviceOrThrow();
    const finished = new Date().toISOString();
    const current = await service.from("sol_runtime_task_attempts").select("started_at").eq("id", attemptId).single();
    if (current.error) throw current.error;
    const durationMs = Math.max(0, Date.now() - Date.parse(String(current.data.started_at)));
    const result = await service.from("sol_runtime_task_attempts").update({ status: "completed", output, completed_at: finished, duration_ms: durationMs }).eq("id", attemptId);
    if (result.error) throw result.error;
  }

  async failAttempt(attemptId: string, error: { code: string; message: string }) {
    const service = serviceOrThrow();
    const finished = new Date().toISOString();
    const current = await service.from("sol_runtime_task_attempts").select("started_at").eq("id", attemptId).single();
    if (current.error) throw current.error;
    const durationMs = Math.max(0, Date.now() - Date.parse(String(current.data.started_at)));
    const result = await service.from("sol_runtime_task_attempts").update({ status: "failed", error_code: error.code, error_message: error.message.slice(0, 4000), completed_at: finished, duration_ms: durationMs }).eq("id", attemptId);
    if (result.error) throw result.error;
  }

  async emit(input: { runId: string; taskId?: string | null; eventType: string; message: string; details?: Record<string, unknown> }) {
    const service = serviceOrThrow();
    const result = await service.from("sol_runtime_events").insert({
      run_id: input.runId,
      task_id: input.taskId ?? null,
      event_type: input.eventType,
      message: input.message,
      details: input.details ?? {}
    });
    if (result.error) throw result.error;
  }

  async heartbeat(taskId: string, workerId: string, leaseSeconds: number) {
    const service = serviceOrThrow();
    const now = new Date();
    const result = await service.from("sol_runtime_tasks").update({
      heartbeat_at: now.toISOString(),
      lease_expires_at: new Date(now.getTime() + Math.max(15, leaseSeconds) * 1000).toISOString()
    }).eq("id", taskId).eq("worker_id", workerId).eq("status", "running").select("id").maybeSingle();
    if (result.error) throw result.error;
    return Boolean(result.data);
  }

  async completeTask(taskId: string, workerId: string, output: Record<string, unknown>) {
    const service = serviceOrThrow();
    const result = await service.from("sol_runtime_tasks").update({
      status: "completed",
      output,
      completed_at: new Date().toISOString(),
      heartbeat_at: null,
      lease_expires_at: null,
      worker_id: null,
      error_code: null,
      error_message: null
    }).eq("id", taskId).eq("worker_id", workerId).eq("status", "running").select("id").maybeSingle();
    if (result.error) throw result.error;
    return Boolean(result.data);
  }

  async scheduleRetry(taskId: string, workerId: string, input: { nextRetryAt: string; errorCode: string; errorMessage: string }) {
    const service = serviceOrThrow();
    const result = await service.from("sol_runtime_tasks").update({
      status: "retry_scheduled",
      next_retry_at: input.nextRetryAt,
      error_code: input.errorCode,
      error_message: input.errorMessage.slice(0, 4000),
      heartbeat_at: null,
      lease_expires_at: null,
      worker_id: null
    }).eq("id", taskId).eq("worker_id", workerId).eq("status", "running").select("id").maybeSingle();
    if (result.error) throw result.error;
    return Boolean(result.data);
  }

  async failTask(taskId: string, workerId: string, input: { status: "failed" | "stalled"; errorCode: string; errorMessage: string }) {
    const service = serviceOrThrow();
    const result = await service.from("sol_runtime_tasks").update({
      status: input.status,
      error_code: input.errorCode,
      error_message: input.errorMessage.slice(0, 4000),
      completed_at: new Date().toISOString(),
      heartbeat_at: null,
      lease_expires_at: null,
      worker_id: null
    }).eq("id", taskId).eq("worker_id", workerId).eq("status", "running").select("id").maybeSingle();
    if (result.error) throw result.error;
    return Boolean(result.data);
  }

  async waitForApproval(task: SolRuntimeTaskRecord, input: { type: SolRuntimeTaskRecord["approvalType"] extends infer _T ? import("./sol-core/types/runtime").SolApprovalType : never; requestedAction: string }) {
    const service = serviceOrThrow();
    const existing = await service.from("sol_runtime_approvals").select("id").eq("task_id", task.id).eq("status", "pending").maybeSingle();
    if (existing.error) throw existing.error;
    let approvalId = existing.data?.id ? String(existing.data.id) : "";
    if (!approvalId) {
      const inserted = await service.from("sol_runtime_approvals").insert({
        run_id: task.runId,
        task_id: task.id,
        type: input.type,
        requested_action: input.requestedAction,
        artifact_ids: [],
        status: "pending"
      }).select("id").single();
      if (inserted.error) throw inserted.error;
      approvalId = String(inserted.data.id);
    }
    const updated = await service.from("sol_runtime_tasks").update({
      status: "waiting_for_approval",
      output: { approvalId },
      heartbeat_at: null,
      lease_expires_at: null,
      worker_id: null
    }).eq("id", task.id).eq("worker_id", task.workerId).eq("status", "running");
    if (updated.error) throw updated.error;
    return approvalId;
  }

  async unblockTasks(runId: string) {
    const service = serviceOrThrow();
    const result = await service.rpc("sol_runtime_unblock_tasks", { p_run_id: runId });
    if (result.error) throw result.error;
    return Number(result.data) || 0;
  }

  async updateRunStatus(runId: string, status: SolRunStatus, output?: Record<string, unknown>) {
    const service = serviceOrThrow();
    const values: Record<string, unknown> = { status };
    if (output) values.output = output;
    if (status === "running" && !values.started_at) values.started_at = new Date().toISOString();
    if (["completed", "failed", "stalled", "cancelled", "superseded"].includes(status)) values.completed_at = new Date().toISOString();
    else values.completed_at = null;
    const result = await service.from("sol_runtime_runs").update(values).eq("id", runId).neq("status", "cancelled").neq("status", "superseded");
    if (result.error) throw result.error;
  }

  async releaseExpiredLeases() {
    const service = serviceOrThrow();
    const result = await service.from("sol_runtime_tasks")
      .select("id,run_id,attempt_count,max_attempts,retry_strategy,retry_base_delay_ms,retry_max_delay_ms,lease_expires_at")
      .eq("status", "running")
      .lt("lease_expires_at", new Date().toISOString())
      .order("lease_expires_at", { ascending: true })
      .limit(100);
    if (result.error) throw result.error;
    let recovered = 0;
    let stalled = 0;
    for (const row of result.data ?? []) {
      const attemptCount = Number(row.attempt_count) || 0;
      const maxAttempts = Math.max(1, Number(row.max_attempts) || 1);
      if (attemptCount < maxAttempts) {
        const base = Math.max(0, Number(row.retry_base_delay_ms) || 0);
        const max = Math.max(base, Number(row.retry_max_delay_ms) || base);
        const delay = String(row.retry_strategy) === "fixed" ? base : Math.min(max, base * 2 ** Math.max(0, attemptCount - 1));
        const nextRetryAt = new Date(Date.now() + delay).toISOString();
        const updated = await service.from("sol_runtime_tasks").update({
          status: "retry_scheduled",
          worker_id: null,
          heartbeat_at: null,
          lease_expires_at: null,
          next_retry_at: nextRetryAt,
          error_code: "LEASE_EXPIRED",
          error_message: "Worker lease expired. Runtime scheduled deterministic recovery."
        }).eq("id", row.id).eq("status", "running").lt("lease_expires_at", new Date().toISOString()).select("id").maybeSingle();
        if (updated.error) throw updated.error;
        if (updated.data) {
          recovered += 1;
          await this.emit({ runId: String(row.run_id), taskId: String(row.id), eventType: "retry.scheduled", message: "Worker lease expired. Task recovered for retry.", details: { nextRetryAt, attemptCount } });
        }
      } else {
        const updated = await service.from("sol_runtime_tasks").update({
          status: "stalled",
          worker_id: null,
          heartbeat_at: null,
          lease_expires_at: null,
          completed_at: new Date().toISOString(),
          error_code: "LEASE_EXHAUSTED",
          error_message: "Worker lease expired after the maximum attempts."
        }).eq("id", row.id).eq("status", "running").lt("lease_expires_at", new Date().toISOString()).select("id").maybeSingle();
        if (updated.error) throw updated.error;
        if (updated.data) {
          stalled += 1;
          await this.emit({ runId: String(row.run_id), taskId: String(row.id), eventType: "task.stalled", message: "Worker lease expired and retry budget is exhausted.", details: { attemptCount, maxAttempts } });
        }
      }
    }
    return { recovered, stalled };
  }
}
