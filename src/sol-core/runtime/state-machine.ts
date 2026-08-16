import type { SolRunStatus, SolTaskStatus } from "../types/runtime";

const TASK_TRANSITIONS: Record<SolTaskStatus, ReadonlySet<SolTaskStatus>> = {
  pending: new Set(["blocked", "queued", "cancelled", "skipped"]),
  blocked: new Set(["queued", "cancelled", "skipped"]),
  queued: new Set(["running", "cancelled", "skipped"]),
  running: new Set(["waiting", "waiting_for_approval", "retry_scheduled", "verifying", "completed", "failed", "stalled", "cancelled"]),
  waiting: new Set(["queued", "running", "failed", "stalled", "cancelled"]),
  waiting_for_approval: new Set(["completed", "repairing", "failed", "cancelled"]),
  retry_scheduled: new Set(["queued", "running", "failed", "stalled", "cancelled"]),
  verifying: new Set(["completed", "repairing", "retry_scheduled", "failed", "stalled", "cancelled"]),
  repairing: new Set(["queued", "running", "verifying", "waiting_for_approval", "completed", "failed", "stalled", "cancelled"]),
  completed: new Set(),
  failed: new Set(["queued", "retry_scheduled", "repairing", "cancelled"]),
  stalled: new Set(["queued", "repairing", "cancelled"]),
  cancelled: new Set(),
  skipped: new Set()
};

const RUN_TRANSITIONS: Record<SolRunStatus, ReadonlySet<SolRunStatus>> = {
  created: new Set(["planning", "queued", "cancelled", "superseded"]),
  planning: new Set(["queued", "failed", "cancelled", "superseded"]),
  queued: new Set(["running", "waiting_for_approval", "failed", "stalled", "cancelled", "superseded"]),
  running: new Set(["waiting_for_approval", "retrying", "repairing", "completed", "failed", "stalled", "cancelled", "superseded"]),
  waiting_for_approval: new Set(["running", "repairing", "completed", "failed", "cancelled", "superseded"]),
  retrying: new Set(["queued", "running", "failed", "stalled", "cancelled", "superseded"]),
  repairing: new Set(["queued", "running", "waiting_for_approval", "completed", "failed", "stalled", "cancelled", "superseded"]),
  completed: new Set(["superseded"]),
  failed: new Set(["queued", "retrying", "repairing", "cancelled", "superseded"]),
  stalled: new Set(["queued", "repairing", "cancelled", "superseded"]),
  cancelled: new Set(["superseded"]),
  superseded: new Set()
};

export function canTransitionTask(from: SolTaskStatus, to: SolTaskStatus) {
  return from === to || TASK_TRANSITIONS[from].has(to);
}

export function assertTaskTransition(from: SolTaskStatus, to: SolTaskStatus) {
  if (!canTransitionTask(from, to)) throw new Error(`Invalid SOL task transition: ${from} -> ${to}`);
}

export function canTransitionRun(from: SolRunStatus, to: SolRunStatus) {
  return from === to || RUN_TRANSITIONS[from].has(to);
}

export function assertRunTransition(from: SolRunStatus, to: SolRunStatus) {
  if (!canTransitionRun(from, to)) throw new Error(`Invalid SOL run transition: ${from} -> ${to}`);
}
