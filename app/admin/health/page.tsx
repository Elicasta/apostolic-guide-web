import Link from "next/link";
import { redirect } from "next/navigation";
import { Activity, AlertTriangle, ArrowRight, CheckCircle2, CircleHelp, RefreshCw, XCircle } from "lucide-react";
import { getStudioPermission } from "@/auth";
import { getStudioHealth, type HealthState } from "@/studio-health";

function iconForState(state: HealthState) {
  if (state === "healthy") return <CheckCircle2 size={19}/>;
  if (state === "error") return <XCircle size={19}/>;
  if (state === "warning") return <AlertTriangle size={19}/>;
  return <CircleHelp size={19}/>;
}

function labelForState(state: HealthState) {
  if (state === "healthy") return "Healthy";
  if (state === "error") return "Error";
  if (state === "warning") return "Needs attention";
  return "Not configured";
}

export default async function HealthPage() {
  const { access, allowed } = await getStudioPermission("view_health");
  if (!allowed || access.state !== "allowed") redirect("/admin");
  const health = await getStudioHealth();
  const overallLabel = health.errors > 0 ? "Degraded" : health.warnings > 0 ? "Attention needed" : "All systems operational";

  return <>
    <span className="eyebrow">System</span>
    <div className="studio-page-heading health-heading">
      <div><h1>Health</h1><p className="admin-lede">One place to verify the services that keep Apostolic Guide Studio, relationship tracking, distribution, and analytics running.</p></div>
      <Link className="button button-outline" href="/admin/health"><RefreshCw size={15}/> Run checks</Link>
    </div>

    <section className={`health-overview health-${health.overall}`}>
      <div className="health-overview-icon"><Activity size={22}/></div>
      <div><span className="section-kicker">Current status</span><h2>{overallLabel}</h2><p>Last checked {new Date(health.checkedAt).toLocaleString()}</p></div>
      <div className="health-overview-counts"><span><strong>{health.healthy}</strong> healthy</span><span><strong>{health.warnings}</strong> attention</span><span><strong>{health.errors}</strong> errors</span></div>
    </section>

    <div className="health-grid">{health.checks.map((check) => {
      const card = <>
        <div className={`health-state-icon state-${check.state}`}>{iconForState(check.state)}</div>
        <div className="health-card-main"><div className="health-card-title"><h2>{check.label}</h2><span className={`health-state state-${check.state}`}>{labelForState(check.state)}</span></div><p>{check.summary}</p>{check.detail ? <small>{check.detail}</small> : null}</div>
        {check.metric ? <strong className="health-card-metric">{check.metric}</strong> : null}
        {check.href ? <ArrowRight className="health-card-arrow" size={16}/> : null}
      </>;
      return check.href ? <Link href={check.href} className="admin-card health-card" key={check.key}>{card}</Link> : <div className="admin-card health-card" key={check.key}>{card}</div>;
    })}</div>

    <section className="admin-card health-note">
      <div><span className="section-kicker">How this works</span><h2>Live checks, not decorative status lights</h2></div>
      <p>Database-backed systems are queried when this page loads. Integration checks read the same connection state Studio uses in production. A green state means that dependency answered the check, not merely that a setting exists.</p>
    </section>
  </>;
}
