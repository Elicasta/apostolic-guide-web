import "server-only";
import { createServiceClient } from "./supabase";

export async function getSolRuntimeRuns(limit = 100) {
  const db = createServiceClient();
  if (!db) return [];
  const result = await db.from("sol_runtime_runs")
    .select("id,goal,workflow_key,workflow_version,status,mode,environment,execution_generation,created_at,started_at,completed_at,updated_at")
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(limit, 250)));
  if (result.error) throw result.error;
  return result.data ?? [];
}

export async function getSolRuntimeArtifacts(limit = 200) {
  const db = createServiceClient();
  if (!db) return [];
  const result = await db.from("sol_runtime_artifacts")
    .select("id,run_id,task_id,type,title,storage_type,location,metadata,verification_status,created_at")
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(limit, 500)));
  if (result.error) throw result.error;
  return result.data ?? [];
}

export async function getSolRuntimeHealth() {
  const db = createServiceClient();
  if (!db) return { configured: false, queueDepth: 0, running: 0, retrying: 0, stalled: 0, approvals: 0, recentFailures: [], recentEvents: [], metrics: {} as Record<string, number> };
  const now = new Date();
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const [tasks, approvals, failures, events, metrics] = await Promise.all([
    db.from("sol_runtime_tasks").select("status").in("status", ["queued","blocked","pending","running","retry_scheduled","stalled"]),
    db.from("sol_runtime_approvals").select("id", { count: "exact", head: true }).eq("status", "pending"),
    db.from("sol_runtime_tasks").select("id,run_id,name,status,error_code,error_message,updated_at").in("status", ["failed","stalled"]).order("updated_at", { ascending: false }).limit(12),
    db.from("sol_runtime_events").select("id,run_id,task_id,event_type,message,details,created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(40),
    db.from("sol_runtime_metrics").select("metric_key,value,created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(500)
  ]);
  for (const result of [tasks, approvals, failures, events, metrics]) if (result.error) throw result.error;
  const statuses = (tasks.data ?? []).map((row) => String(row.status));
  const aggregate: Record<string, number> = {};
  for (const row of metrics.data ?? []) aggregate[String(row.metric_key)] = (aggregate[String(row.metric_key)] || 0) + Number(row.value || 0);
  return {
    configured: true,
    queueDepth: statuses.filter((status) => ["queued","blocked","pending"].includes(status)).length,
    running: statuses.filter((status) => status === "running").length,
    retrying: statuses.filter((status) => status === "retry_scheduled").length,
    stalled: statuses.filter((status) => status === "stalled").length,
    approvals: Number(approvals.count) || 0,
    recentFailures: failures.data ?? [],
    recentEvents: events.data ?? [],
    metrics: aggregate
  };
}

export async function getSolRuntimeRunDetail(runId: string) {
  const db = createServiceClient();
  if (!db) return null;
  const [run, tasks, events, approvals, artifacts, attempts] = await Promise.all([
    db.from("sol_runtime_runs").select("*").eq("id", runId).maybeSingle(),
    db.from("sol_runtime_tasks").select("*").eq("run_id", runId).order("created_at", { ascending: true }),
    db.from("sol_runtime_events").select("*").eq("run_id", runId).order("created_at", { ascending: false }).limit(200),
    db.from("sol_runtime_approvals").select("*").eq("run_id", runId).order("requested_at", { ascending: false }),
    db.from("sol_runtime_artifacts").select("*").eq("run_id", runId).order("created_at", { ascending: false }),
    db.from("sol_runtime_task_attempts").select("*").eq("run_id", runId).order("started_at", { ascending: true })
  ]);
  for (const result of [run, tasks, events, approvals, artifacts, attempts]) if (result.error) throw result.error;
  if (!run.data) return null;
  return { run: run.data, tasks: tasks.data ?? [], events: events.data ?? [], approvals: approvals.data ?? [], artifacts: artifacts.data ?? [], attempts: attempts.data ?? [] };
}
