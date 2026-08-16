export const SOL_RUNTIME_EVENT_TYPES = [
  "run.created",
  "plan.created",
  "task.queued",
  "task.claimed",
  "task.started",
  "tool.started",
  "tool.completed",
  "tool.failed",
  "verification.started",
  "verification.passed",
  "verification.failed",
  "retry.scheduled",
  "approval.requested",
  "approval.resolved",
  "repair.created",
  "artifact.created",
  "artifact.verified",
  "run.completed",
  "run.failed",
  "run.cancelled"
] as const;

export type SolRuntimeEventType = typeof SOL_RUNTIME_EVENT_TYPES[number];

export function solEvent(input: {
  eventType: SolRuntimeEventType;
  runId: string;
  taskId?: string | null;
  message: string;
  details?: Record<string, unknown>;
}) {
  return {
    eventType: input.eventType,
    runId: input.runId,
    taskId: input.taskId ?? null,
    message: input.message,
    details: input.details ?? {},
    createdAt: new Date().toISOString()
  };
}
