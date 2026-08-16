import type { SolPlan, SolTaskDefinition, SolTaskStatus } from "../types/runtime";

const TERMINAL_SUCCESS = new Set<SolTaskStatus>(["completed", "skipped"]);

export function validateSolPlan(plan: SolPlan) {
  if (!plan.id.trim()) throw new Error("SOL plan id is required.");
  if (!plan.goal.trim()) throw new Error("SOL plan goal is required.");
  if (!Number.isInteger(plan.version) || plan.version < 1) throw new Error("SOL plan version must be a positive integer.");

  const ids = new Set<string>();
  for (const task of plan.tasks) {
    if (!task.id.trim()) throw new Error("Every SOL task needs an id.");
    if (ids.has(task.id)) throw new Error(`Duplicate SOL task id: ${task.id}`);
    if (!task.tool && !task.workflow) throw new Error(`SOL task ${task.id} must declare a tool or workflow.`);
    if (task.tool && task.workflow) throw new Error(`SOL task ${task.id} cannot declare both a tool and workflow.`);
    if (task.timeoutMs <= 0) throw new Error(`SOL task ${task.id} must have a positive timeout.`);
    if (task.retryPolicy.maxAttempts < 1) throw new Error(`SOL task ${task.id} must allow at least one attempt.`);
    ids.add(task.id);
  }

  for (const task of plan.tasks) {
    for (const dependency of task.dependsOn) {
      if (dependency === task.id) throw new Error(`SOL task ${task.id} cannot depend on itself.`);
      if (!ids.has(dependency)) throw new Error(`SOL task ${task.id} depends on missing task ${dependency}.`);
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const byId = new Map(plan.tasks.map((task) => [task.id, task]));
  function visit(id: string) {
    if (visited.has(id)) return;
    if (visiting.has(id)) throw new Error(`SOL task graph contains a cycle at ${id}.`);
    visiting.add(id);
    const task = byId.get(id);
    task?.dependsOn.forEach(visit);
    visiting.delete(id);
    visited.add(id);
  }
  plan.tasks.forEach((task) => visit(task.id));
  return plan;
}

export function runnableTaskIds(
  tasks: Array<Pick<SolTaskDefinition, "id" | "dependsOn"> & { status: SolTaskStatus; nextRetryAt?: string | null }>,
  now = Date.now()
) {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  return tasks.filter((task) => {
    const stateAllowsRun = task.status === "queued" || task.status === "retry_scheduled";
    if (!stateAllowsRun) return false;
    if (task.status === "retry_scheduled" && task.nextRetryAt && Date.parse(task.nextRetryAt) > now) return false;
    return task.dependsOn.every((dependency) => {
      const dependencyTask = byId.get(dependency);
      return Boolean(dependencyTask && TERMINAL_SUCCESS.has(dependencyTask.status));
    });
  }).map((task) => task.id);
}

export function initializeTaskStatus(task: Pick<SolTaskDefinition, "dependsOn">): SolTaskStatus {
  return task.dependsOn.length ? "blocked" : "queued";
}
