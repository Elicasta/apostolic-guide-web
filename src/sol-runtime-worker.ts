import "server-only";
import { randomUUID } from "node:crypto";
import { SolRuntimeExecutor } from "./sol-core/runtime/executor";
import { getSolRuntimeToolRegistry, getSolRuntimeVerifierRegistry } from "./sol-runtime-registry";
import { SupabaseSolRuntimeStore } from "./sol-runtime-store-supabase";

const DEFAULT_CONCURRENCY = 4;
const DEFAULT_LEASE_SECONDS = 90;

function concurrencyLimit() {
  const configured = Number(process.env.SOL_RUNTIME_CONCURRENCY || DEFAULT_CONCURRENCY);
  return Math.max(1, Math.min(12, Number.isFinite(configured) ? Math.floor(configured) : DEFAULT_CONCURRENCY));
}

export async function runSolRuntimeWorker(options?: { maxTasks?: number }) {
  const store = new SupabaseSolRuntimeStore();
  const workerId = `sol-runtime:${process.env.VERCEL_REGION || "local"}:${randomUUID()}`;
  const concurrency = concurrencyLimit();
  const maxTasks = Math.max(1, Math.min(options?.maxTasks ?? concurrency * 3, 50));
  const recovery = await store.releaseExpiredLeases();
  const tools = getSolRuntimeToolRegistry();
  const verifiers = getSolRuntimeVerifierRegistry();
  const executor = new SolRuntimeExecutor(store, tools, verifiers, {
    workerId,
    leaseSeconds: DEFAULT_LEASE_SECONDS,
    workflowAllowlisted: (key, version) => Boolean(key && version && [
      "research_and_report",
      "test_and_verify_site",
      "apostolic.pathway_campaign.prepare"
    ].includes(key))
  });

  let executed = 0;
  let batches = 0;
  const runIds = new Set<string>();
  while (executed < maxTasks) {
    const remaining = maxTasks - executed;
    const claimed = await store.claimTasks(workerId, Math.min(concurrency, remaining), DEFAULT_LEASE_SECONDS);
    if (!claimed.length) break;
    batches += 1;
    claimed.forEach((task) => runIds.add(task.runId));
    await Promise.all(claimed.map((task) => executor.executeClaimedTask(task)));
    executed += claimed.length;
  }

  for (const runId of runIds) await executor.reconcileRun(runId);
  return { workerId, recovery, executed, batches, runIds: [...runIds] };
}
