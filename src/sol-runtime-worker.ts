import "server-only";
import { randomUUID } from "node:crypto";
import { SolRuntimeExecutor } from "./sol-core/runtime/executor";
import type { SolRuntimeTaskRecord } from "./sol-core/runtime/store";
import { getSolRuntimeToolRegistry, getSolRuntimeVerifierRegistry, isSolRuntimeWorkflowTrusted } from "./sol-runtime-registry";
import { InstrumentedSupabaseSolRuntimeStore } from "./sol-runtime-store-instrumented";

const DEFAULT_CONCURRENCY = 4;
const DEFAULT_LEASE_SECONDS = 90;

function concurrencyLimit() {
  const configured = Number(process.env.SOL_RUNTIME_CONCURRENCY || DEFAULT_CONCURRENCY);
  return Math.max(1, Math.min(12, Number.isFinite(configured) ? Math.floor(configured) : DEFAULT_CONCURRENCY));
}

export async function runSolRuntimeWorker(options?: { maxTasks?: number }) {
  const store = new InstrumentedSupabaseSolRuntimeStore();
  const workerId = `sol-runtime:${process.env.VERCEL_REGION || "local"}:${randomUUID()}`;
  const concurrency = concurrencyLimit();
  const maxTasks = Math.max(1, Math.min(options?.maxTasks ?? concurrency * 3, 50));
  const started = Date.now();
  const recovery = await store.releaseExpiredLeases();
  const tools = getSolRuntimeToolRegistry();
  const verifiers = getSolRuntimeVerifierRegistry();
  const executor = new SolRuntimeExecutor(store, tools, verifiers, {
    workerId,
    leaseSeconds: DEFAULT_LEASE_SECONDS,
    workflowAllowlisted: isSolRuntimeWorkflowTrusted
  });

  let executed = 0;
  let batches = 0;
  const runIds = new Set<string>();
  while (executed < maxTasks) {
    const remaining = maxTasks - executed;
    const claimed: SolRuntimeTaskRecord[] = await store.claimTasks(workerId, Math.min(concurrency, remaining), DEFAULT_LEASE_SECONDS);
    if (!claimed.length) break;
    batches += 1;
    claimed.forEach((task) => runIds.add(task.runId));
    await Promise.all(claimed.map((task) => executor.executeClaimedTask(task)));
    executed += claimed.length;
  }

  for (const runId of runIds) await executor.reconcileRun(runId);
  await Promise.all([
    store.recordMetric({ metricKey: "worker_runs", value: 1, metadata: { workerId, durationMs: Date.now() - started } }),
    store.recordMetric({ metricKey: "tasks_claimed", value: executed, metadata: { workerId, batches } }),
    store.recordMetric({ metricKey: "leases_recovered", value: recovery.recovered, metadata: { workerId } }),
    store.recordMetric({ metricKey: "leases_stalled", value: recovery.stalled, metadata: { workerId } })
  ]);
  return { workerId, recovery, executed, batches, runIds: [...runIds] };
}
