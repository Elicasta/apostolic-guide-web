import "server-only";
import { SupabaseSolRuntimeStore } from "./sol-runtime-store-supabase";
import { createServiceClient } from "./supabase";

export class InstrumentedSupabaseSolRuntimeStore extends SupabaseSolRuntimeStore {
  async recordMetric(input: { runId?: string | null; metricKey: string; value?: number; metadata?: Record<string, unknown> }) {
    const service = createServiceClient();
    if (!service) throw new Error("SOL Runtime database is not configured.");
    const result = await service.from("sol_runtime_metrics").insert({
      run_id: input.runId ?? null,
      metric_key: input.metricKey,
      value: input.value ?? 1,
      metadata: input.metadata ?? {}
    });
    if (result.error) throw result.error;
  }
}
