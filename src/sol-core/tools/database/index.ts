import { z } from "zod";
import { createServiceClient } from "../../../supabase";
import type { SolTool } from "../types";

const READ_TABLES = new Set([
  "sol_runtime_runs","sol_runtime_tasks","sol_runtime_task_attempts","sol_runtime_events","sol_runtime_approvals","sol_runtime_artifacts","sol_runtime_observations","sol_runtime_metrics",
  "pathway_audio_assets","pathway_audio_scripts","pathway_video_projects","pathway_video_renders","pathway_video_publishing_kits","pathway_assets","pathway_publishing_profiles","pathway_publications",
  "social_automations","growth_journeys","studio_content_calendar_items"
]);
const WRITE_TABLES = new Set([
  "sol_runtime_events","sol_runtime_metrics","pathway_assets","pathway_publishing_profiles","pathway_publications","social_automations","growth_journeys","studio_content_calendar_items"
]);

const filterSchema = z.object({ column: z.string().regex(/^[a-z_][a-z0-9_]*$/), op: z.enum(["eq","neq","gt","gte","lt","lte","in","is"]), value: z.unknown() });

function client() {
  const service = createServiceClient();
  if (!service) throw new Error("Database is not configured.");
  return service;
}

function safeColumns(columns: string[]) {
  if (!columns.length) return "*";
  for (const column of columns) if (!/^[a-z_][a-z0-9_]*$/.test(column)) throw new Error(`Unsafe column: ${column}`);
  return columns.join(",");
}

function applyFilters(query: any, filters: z.infer<typeof filterSchema>[]) {
  let current = query;
  for (const filter of filters) {
    if (filter.op === "in") current = current.in(filter.column, Array.isArray(filter.value) ? filter.value : [filter.value]);
    else if (filter.op === "is") current = current.is(filter.column, filter.value);
    else current = current[filter.op](filter.column, filter.value);
  }
  return current;
}

const queryInput = z.object({ table: z.string(), columns: z.array(z.string()).max(40).default([]), filters: z.array(filterSchema).max(20).default([]), limit: z.number().int().min(1).max(500).default(100), orderBy: z.string().regex(/^[a-z_][a-z0-9_]*$/).optional(), ascending: z.boolean().default(true) });
const queryOutput = z.object({ rows: z.array(z.record(z.string(), z.unknown())), count: z.number().int().nonnegative() });
export const solDatabaseQueryTool: SolTool<z.infer<typeof queryInput>, z.infer<typeof queryOutput>> = {
  name: "database.query", description: "Read structured rows from an allowlisted Studio table.", inputSchema: queryInput, outputSchema: queryOutput,
  permissions: ["read"], supportedEnvironments: ["local","development","preview","production"], idempotency: "not_required",
  async execute(input) {
    try {
      if (!READ_TABLES.has(input.table)) throw new Error(`Table ${input.table} is not in the runtime read allowlist.`);
      let query: any = client().from(input.table).select(safeColumns(input.columns)).limit(input.limit);
      query = applyFilters(query, input.filters);
      if (input.orderBy) query = query.order(input.orderBy, { ascending: input.ascending });
      const result = await query;
      if (result.error) throw result.error;
      const rows = (result.data ?? []) as unknown as Array<Record<string, unknown>>;
      return { ok: true, data: { rows, count: rows.length }, observations: { table: input.table, count: rows.length } };
    } catch (error) {
      return { ok: false, error: { code: "DATABASE_QUERY_FAILED", message: error instanceof Error ? error.message : "Database query failed.", retryable: false } };
    }
  }
};

const insertInput = z.object({ table: z.string(), values: z.record(z.string(), z.unknown()), select: z.array(z.string()).max(30).default([]) });
const mutationOutput = z.object({ rows: z.array(z.record(z.string(), z.unknown())), count: z.number().int().nonnegative() });
export const solDatabaseInsertTool: SolTool<z.infer<typeof insertInput>, z.infer<typeof mutationOutput>> = {
  name: "database.insert", description: "Insert one row into an allowlisted Studio table.", inputSchema: insertInput, outputSchema: mutationOutput,
  permissions: ["write"], supportedEnvironments: ["local","development","preview","production"], idempotency: "required",
  async execute(input) {
    try {
      if (!WRITE_TABLES.has(input.table)) throw new Error(`Table ${input.table} is not in the runtime write allowlist.`);
      const result = await client().from(input.table).insert(input.values).select(safeColumns(input.select));
      if (result.error) throw result.error;
      const rows = (result.data ?? []) as unknown as Array<Record<string, unknown>>;
      return { ok: true, data: { rows, count: rows.length } };
    } catch (error) {
      return { ok: false, error: { code: "DATABASE_INSERT_FAILED", message: error instanceof Error ? error.message : "Database insert failed.", retryable: false } };
    }
  }
};

const updateInput = z.object({ table: z.string(), values: z.record(z.string(), z.unknown()), filters: z.array(filterSchema).min(1).max(20), select: z.array(z.string()).max(30).default([]) });
export const solDatabaseUpdateTool: SolTool<z.infer<typeof updateInput>, z.infer<typeof mutationOutput>> = {
  name: "database.update", description: "Update matching rows in an allowlisted Studio table. At least one filter is required.", inputSchema: updateInput, outputSchema: mutationOutput,
  permissions: ["write"], supportedEnvironments: ["local","development","preview","production"], idempotency: "required",
  async execute(input) {
    try {
      if (!WRITE_TABLES.has(input.table)) throw new Error(`Table ${input.table} is not in the runtime write allowlist.`);
      let query: any = client().from(input.table).update(input.values);
      query = applyFilters(query, input.filters);
      const result = await query.select(safeColumns(input.select));
      if (result.error) throw result.error;
      const rows = (result.data ?? []) as unknown as Array<Record<string, unknown>>;
      return { ok: true, data: { rows, count: rows.length } };
    } catch (error) {
      return { ok: false, error: { code: "DATABASE_UPDATE_FAILED", message: error instanceof Error ? error.message : "Database update failed.", retryable: false } };
    }
  }
};

const transactionInput = z.object({ operations: z.array(z.object({ kind: z.enum(["event","metric"]), values: z.record(z.string(), z.unknown()) })).min(1).max(100) });
const transactionOutput = z.object({ applied: z.number().int().nonnegative() });
export const solDatabaseTransactionTool: SolTool<z.infer<typeof transactionInput>, z.infer<typeof transactionOutput>> = {
  name: "database.transaction", description: "Atomically append runtime event/metric operations through a guarded database RPC.", inputSchema: transactionInput, outputSchema: transactionOutput,
  permissions: ["write"], supportedEnvironments: ["local","development","preview","production"], idempotency: "required",
  async execute(input) {
    try {
      const result = await client().rpc("sol_runtime_apply_transaction", { p_operations: input.operations });
      if (result.error) throw result.error;
      return { ok: true, data: { applied: Number(result.data) || 0 } };
    } catch (error) {
      return { ok: false, error: { code: "DATABASE_TRANSACTION_FAILED", message: error instanceof Error ? error.message : "Database transaction failed.", retryable: false } };
    }
  }
};
