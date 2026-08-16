import type { SolEnvironment, SolPlan, SolTaskDefinition } from "../types/runtime";
import { validateSolPlan } from "../runtime/task-graph";

export type SolWorkflowDefinition<TInput extends Record<string, unknown> = Record<string, unknown>> = {
  key: string;
  version: number;
  description: string;
  trusted: boolean;
  createTasks: (input: TInput) => SolTaskDefinition[];
};

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

  createPlan(input: {
    planId: string;
    key: string;
    version: number;
    goal: string;
    environment: SolEnvironment;
    workflowInput: Record<string, unknown>;
  }): SolPlan {
    const workflow = this.get(input.key, input.version);
    return validateSolPlan({
      id: input.planId,
      version: 1,
      goal: input.goal,
      workflow: { key: workflow.key, version: workflow.version },
      environment: input.environment,
      tasks: workflow.createTasks(input.workflowInput)
    });
  }

  list() {
    return [...this.workflows.values()].map(({ key, version, description, trusted }) => ({ key, version, description, trusted }));
  }
}
