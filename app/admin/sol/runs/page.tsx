import Link from "next/link";
import { redirect } from "next/navigation";
import { getStudioPermission } from "@/auth";
import { getSolRuntimeRuns } from "@/sol-runtime-dashboard";
import { createServiceClient } from "@/supabase";
import { SolRuntimeNav } from "../runtime-nav";
import "../runtime-pages.css";

export const dynamic = "force-dynamic";

export default async function SolRuntimeRunsPage() {
  const permission = await getStudioPermission("view_workspace");
  if (!permission.allowed && permission.access.state !== "unconfigured") redirect("/admin");
  const runs = await getSolRuntimeRuns(120);
  const db = createServiceClient();
  const runIds = runs.map((run) => run.id);
  const taskResult = db && runIds.length ? await db.from("sol_runtime_tasks").select("run_id,status,name,task_key").in("run_id", runIds) : { data: [], error: null };
  if (taskResult.error) throw taskResult.error;
  const tasksByRun = new Map<string, Array<{ status: string; name: string; task_key: string }>>();
  for (const raw of taskResult.data ?? []) {
    const row = raw as { run_id: string; status: string; name: string; task_key: string };
    const bucket = tasksByRun.get(row.run_id) ?? [];
    bucket.push(row);
    tasksByRun.set(row.run_id, bucket);
  }

  return <main className="sol-runtime-page">
    <SolRuntimeNav />
    <header className="sol-runtime-heading">
      <div><span className="sol-runtime-kicker">Durable execution</span><h1>Runs</h1><p>Every workflow is persisted as a task graph. Browser reloads do not erase work, reviews are not completion, and retries keep their own attempt history.</p></div>
    </header>
    {runs.length ? <table className="sol-runtime-table">
      <thead><tr><th>Workflow</th><th>Status</th><th>Progress</th><th>Current task</th><th>Started</th></tr></thead>
      <tbody>{runs.map((run) => {
        const tasks = tasksByRun.get(run.id) ?? [];
        const finished = tasks.filter((task) => task.status === "completed" || task.status === "skipped").length;
        const progress = tasks.length ? Math.round((finished / tasks.length) * 100) : 0;
        const current = tasks.find((task) => ["running","waiting_for_approval","repairing","retry_scheduled","queued"].includes(task.status));
        return <tr key={run.id}>
          <td><Link href={`/admin/sol/runs/${run.id}`}><strong>{run.workflow_key || "ad-hoc plan"}</strong></Link><br /><small>{run.goal}</small></td>
          <td><span className={`sol-runtime-status is-${run.status}`}>{String(run.status).replaceAll("_", " ")}</span></td>
          <td>{progress}%<div className="sol-runtime-progress"><i style={{ width: `${progress}%` }} /></div></td>
          <td>{current ? <><strong>{current.name}</strong><br /><small>{current.status.replaceAll("_", " ")}</small></> : <span>{run.status === "completed" ? "Finished" : "Waiting"}</span>}</td>
          <td>{new Date(run.started_at || run.created_at).toLocaleString()}</td>
        </tr>;
      })}</tbody>
    </table> : <div className="sol-runtime-empty">No runtime runs yet.</div>}
  </main>;
}
