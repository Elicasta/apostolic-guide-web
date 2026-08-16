import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getStudioPermission } from "@/auth";
import { getSolRuntimeRunDetail } from "@/sol-runtime-dashboard";
import { SolRunActions } from "../../run-actions";
import { SolRuntimeNav } from "../../runtime-nav";
import "../../runtime-pages.css";

export const dynamic = "force-dynamic";

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function pretty(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

export default async function SolRuntimeRunPage({ params }: { params: Promise<{ runId: string }> }) {
  const permission = await getStudioPermission("view_workspace");
  if (!permission.allowed && permission.access.state !== "unconfigured") redirect("/admin");
  const { runId } = await params;
  const detail = await getSolRuntimeRunDetail(runId);
  if (!detail) notFound();
  const { run, tasks, events, approvals, artifacts, attempts } = detail;
  const finished = tasks.filter((task) => task.status === "completed" || task.status === "skipped").length;
  const progress = tasks.length ? Math.round((finished / tasks.length) * 100) : 0;
  const current = tasks.find((task) => ["running", "waiting_for_approval", "repairing", "retry_scheduled", "queued"].includes(task.status));

  return <main className="sol-runtime-page">
    <SolRuntimeNav />
    <Link href="/admin/sol/runs" style={{ color: "#aab7ca", textDecoration: "none" }}>← Runs</Link>
    <header className="sol-runtime-heading">
      <div>
        <span className="sol-runtime-kicker">{run.workflow_key || "ad-hoc plan"} · v{run.workflow_version || "?"}</span>
        <h1>{run.goal}</h1>
        <p>Runtime {run.runtime_version} · {run.environment} · {run.mode} · execution generation {run.execution_generation}</p>
      </div>
      <SolRunActions runId={run.id} status={run.status} />
    </header>

    <div className="sol-runtime-cards">
      <div className="sol-runtime-card"><strong>{progress}%</strong><span>graph progress</span><div className="sol-runtime-progress"><i style={{ width: `${progress}%` }} /></div></div>
      <div className="sol-runtime-card"><strong>{tasks.length}</strong><span>tasks</span></div>
      <div className="sol-runtime-card"><strong>{attempts.length}</strong><span>attempts</span></div>
      <div className="sol-runtime-card"><strong>{artifacts.length}</strong><span>artifacts</span></div>
    </div>

    <section className="sol-runtime-panel">
      <h2>Run state</h2>
      <p><span className={`sol-runtime-status is-${run.status}`}>{String(run.status).replaceAll("_", " ")}</span></p>
      <p>{current ? <>Current task: <strong>{current.name}</strong> · {String(current.status).replaceAll("_", " ")}</> : <>No active task. {run.status === "completed" ? "All required work is finished." : "Inspect the task graph below."}</>}</p>
      <pre>{pretty({ intent: run.intent, input: run.input, output: run.output, idempotencyKey: run.idempotency_key, plannerVersion: run.planner_version })}</pre>
    </section>

    <section className="sol-runtime-panel">
      <h2>Task graph</h2>
      <div className="sol-runtime-list">{tasks.map((task) => {
        const taskAttempts = attempts.filter((attempt) => attempt.task_id === task.id);
        return <div className="sol-runtime-item" key={task.id}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div><strong>{task.name}</strong><br /><small>{task.task_key} · {task.tool_name || task.workflow_name || "gate"}</small></div>
            <span className={`sol-runtime-status is-${task.status}`}>{String(task.status).replaceAll("_", " ")}</span>
          </div>
          <p><small>Depends on: {Array.isArray(task.depends_on) && task.depends_on.length ? task.depends_on.join(", ") : "none"} · attempts {task.attempt_count}/{task.max_attempts}</small></p>
          {task.error_message ? <p style={{ color: "#ffb1b8" }}>{task.error_code}: {task.error_message}</p> : null}
          {taskAttempts.length ? <details><summary>Attempts ({taskAttempts.length})</summary><pre>{pretty(taskAttempts.map((attempt) => ({ attempt: attempt.attempt_number, status: attempt.status, durationMs: attempt.duration_ms, errorCode: attempt.error_code, errorMessage: attempt.error_message })))}</pre></details> : null}
        </div>;
      })}</div>
    </section>

    <section className="sol-runtime-panel">
      <h2>Approvals</h2>
      {approvals.length ? <div className="sol-runtime-list">{approvals.map((approval) => <div className="sol-runtime-item" key={approval.id}>
        <strong>{String(approval.type).replaceAll("_", " ")}</strong> · <span className={`sol-runtime-status is-${approval.status}`}>{String(approval.status).replaceAll("_", " ")}</span>
        <p>{approval.requested_action}</p>
        {approval.status === "pending" ? <Link href={`/admin/sol/reviews/${approval.id}`}>Open review</Link> : null}
        {approval.note ? <p><small>Note: {approval.note}</small></p> : null}
      </div>)}</div> : <div className="sol-runtime-empty">No approvals for this run.</div>}
    </section>

    <section className="sol-runtime-panel">
      <h2>Artifacts</h2>
      {artifacts.length ? <div className="sol-runtime-artifacts">{artifacts.map((artifact) => <div className="sol-runtime-artifact" key={artifact.id}>
        <small>{artifact.type} · {artifact.verification_status}</small>
        <h3>{artifact.title}</h3>
        {String(artifact.location || "").startsWith("/") ? <Link href={String(artifact.location)}>Open artifact</Link> : <p>{artifact.location}</p>}
        <p>{Object.keys(record(artifact.metadata)).length ? pretty(artifact.metadata) : "No metadata"}</p>
      </div>)}</div> : <div className="sol-runtime-empty">No artifacts recorded.</div>}
    </section>

    <section className="sol-runtime-panel">
      <h2>Event log</h2>
      {events.length ? <div className="sol-runtime-list">{events.map((event) => <div className="sol-runtime-item" key={event.id}>
        <strong>{event.event_type}</strong><br /><small>{new Date(event.created_at).toLocaleString()}</small>
        <p>{event.message}</p>
        {Object.keys(record(event.details)).length ? <pre>{pretty(event.details)}</pre> : null}
      </div>)}</div> : <div className="sol-runtime-empty">No runtime events.</div>}
    </section>
  </main>;
}
