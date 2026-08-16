import type { ZodType } from "zod";
import type { SolEnvironment, SolPermission } from "../types/runtime";

export type SolToolResult<T> =
  | { ok: true; data: T; observations?: Record<string, unknown> }
  | { ok: false; error: { code: string; message: string; retryable: boolean; details?: Record<string, unknown> } };

export type SolToolContext = {
  runId: string;
  taskId: string;
  attempt: number;
  environment: SolEnvironment;
  idempotencyKey?: string | null;
  signal: AbortSignal;
  emit: (eventType: string, message: string, details?: Record<string, unknown>) => Promise<void>;
};

export interface SolTool<TInput, TOutput> {
  name: string;
  description: string;
  inputSchema: ZodType<TInput>;
  outputSchema: ZodType<TOutput>;
  permissions: SolPermission[];
  supportedEnvironments: SolEnvironment[];
  idempotency: "not_required" | "supported" | "required";
  execute(input: TInput, context: SolToolContext): Promise<SolToolResult<TOutput>>;
}
