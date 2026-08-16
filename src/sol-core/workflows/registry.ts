import type { SolEnvironment, SolPlan, SolTaskDefinition } from "../types/runtime";
import { validateSolPlan } from "../runtime/task-graph";

export type SolWorkflowDefinition<TInput extends Record<string, unknown> = Record<string, unknown>> = {
  key: string;
  version: number;
  description: string;
  trusted: boolean;
  createTasks: (input: TInput) => SolTaskDefinition[];
};

function workflowRef(value: string) {
  const match = value.match(/^(.+)@(\d+)$/);
  if (!match) throw new Error(`Nested workflow must be versioned as key@version: ${value}`);
  return { key: match[1], version: Number(match[2]) };
}

export class SolWorkflowRegistry {
  private readonly workflows = new Map<string, SolWorkflowDefinition>();

  register<TInput extends Record<string, unknown>>(workflow: SolWorkflowDefinition<TInput>) {
    const id = `${workflow.key}@${workflow.version}`;
    if (this.workflows.has(id)) throw new Error(`SOL workflow already registered: ${id}`);
    this.workflows.set(id, workflow as SolWorkflowDefinition);
    return this;
  }

  get(key: string, version: number) {
    const workflow = this.workflows.get(`${key}@${version}`);
    if (!workflow) throw new Error(`SOL workflow is not registered: ${key}@${version}`);
    return workflow;
  }

  private expandTasks(tasks: SolTaskDefinition[], ancestry: string[] = []): SolTaskDefinition[] {
    const expanded: SolTaskDefinition[] = [];
    for (const task of tasks) {
      if (!task.workflow) {
        expanded.push(task);
        continue;
      }
      const ref = workflowRef(task.workflow);
      const identity = `${ref.key}@${ref.version}`;
      if (ancestry.includes(identity)) throw new Error(`Recursive SOL workflow composition detected: ${[...ancestry, identity].join(" -> ")}`);
      const nested = this.get(ref.key, ref.version).createTasks(task.input);
      const prefix = `${task.id}__`;
      const nestedIds = new Set(nested.map((item) => item.id));
      const rewritten = nested.map((item) => ({
        ...item,
        id: `${prefix}${item.id}`,
        dependsOn: [
          ...task.dependsOn,
          ...item.dependsOn.map((dependency) => nestedIds.has(dependency) ? `${prefix}${dependency}` : dependency)
        ].filter((value, index, array) => array.indexOf(value) === index)
      }));
      expanded.push(...this.expandTasks(rewritten, [...ancestry, identity]));
    }
    return expanded;
  }

  createPlan(input: {
    planId: string;
    key: string;
    version: number;
    goal: string;
    environment: SolEnvironment;
    workflowInput: Record<string, unknown>;
  }): SolPlan {
    const workflow = this.get(input.key, input.version);
    const tasks = this.expandTasks(workflow.createTasks(input.workflowInput), [`${workflow.key}@${workflow.version}`]);
    return validateSolPlan({
      id: input.planId,
      version: 1,
      goal: input.goal,
      workflow: { key: workflow.key, version: workflow.version },
      environment: input.environment,
      tasks
    });
  }

  list() {
    return [...this.workflows.values()].map(({ key, version, description, trusted }) => ({ key, version, description, trusted }));
  }
}
