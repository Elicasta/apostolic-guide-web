import type { SolTool } from "./types";

export class SolToolRegistry {
  private readonly tools = new Map<string, SolTool<unknown, unknown>>();

  register<TInput, TOutput>(tool: SolTool<TInput, TOutput>) {
    if (this.tools.has(tool.name)) throw new Error(`SOL tool already registered: ${tool.name}`);
    this.tools.set(tool.name, tool as SolTool<unknown, unknown>);
    return this;
  }

  get(name: string) {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`SOL tool is not registered: ${name}`);
    return tool;
  }

  has(name: string) {
    return this.tools.has(name);
  }

  list() {
    return [...this.tools.values()].map((tool) => ({
      name: tool.name,
      description: tool.description,
      permissions: tool.permissions,
      supportedEnvironments: tool.supportedEnvironments,
      idempotency: tool.idempotency
    }));
  }
}
