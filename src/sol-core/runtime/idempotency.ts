import { createHash } from "node:crypto";

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
    .join(",")}}`;
}

export function solStableHash(value: unknown) {
  return createHash("sha256").update(stable(value)).digest("hex");
}

export function solRunIdempotencyKey(input: {
  workflowKey: string;
  workflowVersion: number;
  environment: string;
  identity: Record<string, unknown>;
}) {
  const digest = solStableHash({
    workflowKey: input.workflowKey,
    workflowVersion: input.workflowVersion,
    environment: input.environment,
    identity: input.identity
  }).slice(0, 32);
  return `${input.workflowKey}:v${input.workflowVersion}:${input.environment}:${digest}`;
}

export function shouldReuseSolRun(status: string) {
  return ["created", "planning", "queued", "running", "waiting_for_approval", "retrying", "repairing", "completed"].includes(status);
}
