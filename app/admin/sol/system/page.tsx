import Link from "next/link";
import { redirect } from "next/navigation";
import { getStudioPermission } from "@/auth";
import { getSolRuntimeHealth } from "@/sol-runtime-dashboard";
import { getSolOperatorSnapshot } from "@/sol-operator";
import { SolRuntimeNav } from "../runtime-nav";
import "../runtime-pages.css";

export const dynamic = "force-dynamic";

export default async function SolRuntimeSystemPage() {
  const permission = await getStudioPermission("view_workspace");
  if (!permission.allowed && permission.access.state !== "unconfigured") redirect("/admin");
  const [health, snapshot] = await Promise.all([getSolRuntimeHealth(), getSolOperatorSnapshot()]);
  const events = health.recentEvents ?? [];
  const lastWorker = events.find((event) => String(event.event_type).startsWith("worker."));

  return <main className="sol-runtime-page">
    <SolRuntimeNav />
    <header className="sol-runtime-heading">
      <div><span className="sol-runtime-kicker">Execution health</span><h1>System</h1><p>The robot is only the cockpit. This page shows the machine underneath it: queue, worker signals, retries, approvals, failures, mode, and recent runtime activity.</p></div>
    </header>

    <div className="sol-runtime-cards">
      <div className="sol-runtime-card"><strong>{health.queueDepth}</strong><span>queued / blocked</span></div>
      <div className="sol-runtime-card"><strong>{health.running}</strong><span>running</span></div>
      <div className="sol-runtime-card"><strong>{health.retrying}</strong><span>retry scheduled</span></div>
      <div className="sol-runtime-card"><strong>{health.approvals}</strong><span>waiting approvals</span></div>
    </div>

    <section className="sol-runtime-panel">
      <h2>Runtime policy</h2>
      <p><span className={`sol-runtime-status is-${snapshot.settings.enabled ? "running" : "stalled"}`}>{snapshot.settings.enabled ? "enabled" : "disabled"}</span> <span className="sol-runtime-status">{snapshot.settings.mode}</span></p>
      <p>Environment: production · database: {health.configured ? "connected" : "not configured"}</p>
      <p>Last worker event: {lastWorker ? `${lastWorker.event_type} · ${new Date(lastWorker.created_at).toLocaleString()}` : "No worker event recorded in the last 24 hours."}</p>
    </section>

    <section className="sol-runtime-panel">
      <h2>Recent failures</h2>
      {health.recentFailures.length ? <div className="sol-runtime-list">{health.recentFailures.map((failure) => <div className="sol-runtime-item" key={failure.id}>
        <strong>{failure.name}</strong> · <span className={`sol-runtime-status is-${failure.status}`}>{failure.status}</span>
        <p>{failure.error_code}: {failure.error_message}</p>
        <Link href={`/admin/sol/runs/${failure.run_id}`}>Inspect run</Link>
      </div>)}</div> : <div className="sol-runtime-empty">No failed or stalled runtime tasks.</div>}
    </section>

    <section className="sol-runtime-panel">
      <h2>Last 24 hours</h2>
      {Object.keys(health.metrics).length ? <div className="sol-runtime-cards">{Object.entries(health.metrics).slice(0, 12).map(([key, value]) => <div className="sol-runtime-card" key={key}><strong>{value}</strong><span>{key.replaceAll("_", " ")}</span></div>)}</div> : <p>No persisted runtime metrics yet.</p>}
      <div className="sol-runtime-list">{events.slice(0, 20).map((event) => <div className="sol-runtime-item" key={event.id}>
        <strong>{event.event_type}</strong><br /><small>{new Date(event.created_at).toLocaleString()}</small><p>{event.message}</p>
      </div>)}</div>
    </section>
  </main>;
}
