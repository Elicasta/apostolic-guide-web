import type { SolTaskStatus } from "../types/runtime";

export type SolProgressTask = {
  status: SolTaskStatus;
  approvalRequired?: boolean;
  required?: boolean;
};

const DONE = new Set<SolTaskStatus>(["completed", "skipped"]);

function percent(done: number, total: number) {
  if (!total) return 100;
  return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
}

export function deriveSolProgress(tasks: SolProgressTask[]) {
  const required = tasks.filter((task) => task.required !== false);
  const execution = required.filter((task) => !task.approvalRequired);
  const executionDone = execution.filter((task) => DONE.has(task.status)).length;
  const overallDone = required.filter((task) => DONE.has(task.status)).length;
  const waitingForApproval = required.some((task) => task.status === "waiting_for_approval");
  const executionPercent = percent(executionDone, execution.length);
  const overallPercent = waitingForApproval && overallDone === required.length
    ? 99
    : percent(overallDone, required.length);

  return {
    executionPercent,
    overallPercent,
    waitingForApproval,
    label: waitingForApproval
      ? executionPercent === 100 ? "Execution finished. Waiting for review." : "Waiting for approval."
      : overallPercent === 100 ? "Complete" : "Running"
  };
}
