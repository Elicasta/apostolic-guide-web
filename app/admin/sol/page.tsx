import Link from "next/link";
import { redirect } from "next/navigation";
import { Activity, Bot, CheckCircle2, Clock3, Gauge, ShieldCheck, Sparkles, TriangleAlert } from "lucide-react";
import { getStudioPermission } from "@/auth";
import { getSolOperatorSnapshot } from "@/sol-operator";

export default async function SolOperatorPage() {
  const permission = await getStudioPermission("view_workspace");
  const localSetup = permission.access.state === "unconfigured";
  if (!permission.allowed && !localSetup) redirect("/admin");

  const snapshot = await getSolOperatorSnapshot();
  const pending = snapshot.proposals.filter((proposal) => proposal.status === "pending");
  const active = snapshot.runs.filter((run) => ["queued", "running", "retrying"].includes(run.status));
  const review = snapshot.runs.filter((run) => run.status === "waiting_review");
  const trouble = snapshot.runs.filter((run) => run.status === "failed" || run.status === "stalled");
  const behind = snapshot.kpis.filter((kpi) => kpi.actual < kpi.target);

  return <div className="sol-v3-control-page">
    <div className="studio-page-heading sol-workspace-heading">
      <div>
        <span className="eyebrow">Studio operations</span>
        <h1>Sol Control Center</h1>
        <p className="admin-lede">Sol is the operator. Forge is its production worker. This page shows what the system actually sees, what it can execute, what is moving, and where human review still owns the decision.</p>
      </div>
      <span className="studio-role-badge">V4 · Forge production</span>
    </div>

    <section className="sol-v3-control-hero">
      <div className="sol-v3-control-hero-copy">
        <span><Bot size={15}/> SOL + FORGE</span>
        <h2>Ask for the production outcome.</h2>
        <p>Open <strong>Ask Sol</strong> from any admin screen. Sol inspects current Studio state and hands production work to Forge. Forge can stage Pathway audio, build persistent carousels, render review artwork, recover background-safe work, and stop at the review gates that still belong to you.</p>
        <div className="sol-v3-control-example">Try: <strong>“Tell me exactly what Forge can finish without me, execute the safe work, and show me only the real review gates.”</strong></div>
      </div>
      <div className={`sol-v3-control-state is-${snapshot.settings.enabled ? snapshot.settings.mode : "off"}`}>
        <i/>
        <span>{snapshot.settings.enabled ? snapshot.settings.mode : "off"}</span>
        <small>Last scan {snapshot.settings.lastScanAt ? new Date(snapshot.settings.lastScanAt).toLocaleString() : "not run"}</small>
        <small>{snapshot.settings.enabled ? "Execution follows the active mode." : "Execution is off. Observation still refreshes every 10 minutes."}</small>
      </div>
    </section>

    <section className="sol-v3-control-metrics" aria-label="Sol current state">
      <article><Sparkles size={17}/><div><strong>{pending.length}</strong><span>Proposals waiting</span></div></article>
      <article><Activity size={17}/><div><strong>{active.length}</strong><span>Runs moving</span></div></article>
      <article><Clock3 size={17}/><div><strong>{review.length}</strong><span>Real review gates</span></div></article>
      <article className={trouble.length ? "is-alert" : ""}><TriangleAlert size={17}/><div><strong>{trouble.length}</strong><span>Failed or stalled</span></div></article>
      <article className={behind.length ? "is-warn" : ""}><Gauge size={17}/><div><strong>{behind.length}</strong><span>KPIs behind</span></div></article>
    </section>

    <div className="sol-v3-control-grid">
      <section className="sol-v3-control-card">
        <div className="sol-v3-control-card-head"><ShieldCheck size={16}/><div><span>Authority model</span><h3>Power controls execution, not visibility.</h3></div></div>
        <div className="sol-v3-control-modes">
          <div className={snapshot.settings.enabled && snapshot.settings.mode === "watch" ? "is-active" : ""}><b>Watch</b><span>Keeps the workspace current, diagnoses gaps, and proposes work. Nothing executes.</span></div>
          <div className={snapshot.settings.enabled && snapshot.settings.mode === "assist" ? "is-active" : ""}><b>Assist</b><span>Executes work you approve and stops at protected review or external-effect gates.</span></div>
          <div className={snapshot.settings.enabled && snapshot.settings.mode === "trusted" ? "is-active" : ""}><b>Trusted</b><span>May auto-run only server-allowlisted safe production drafts. Review-required and external work still stops.</span></div>
        </div>
      </section>

      <section className="sol-v3-control-card">
        <div className="sol-v3-control-card-head"><Activity size={16}/><div><span>Execution model</span><h3>Work must prove where it is.</h3></div></div>
        <div className="sol-v3-control-checks">
          <span><CheckCircle2 size={13}/> Current-work queue instead of historical clutter</span>
          <span><CheckCircle2 size={13}/> Worker lease + heartbeat</span>
          <span><CheckCircle2 size={13}/> Retry with bounded backoff</span>
          <span><CheckCircle2 size={13}/> Duplicate review reconciliation</span>
          <span><CheckCircle2 size={13}/> One-minute recovery and worker loop</span>
          <span><CheckCircle2 size={13}/> Ten-minute observation scan even while execution is off</span>
        </div>
      </section>

      <section className="sol-v3-control-card">
        <div className="sol-v3-control-card-head"><Sparkles size={16}/><div><span>Registered work</span><h3>Production Sol can actually hand to Forge.</h3></div></div>
        <div className="sol-v3-control-recipes">
          <div><b>Forge Pathway audio</b><span>Inspect the canonical Pathway, generate or reuse narration, doctrine-check it, stop for script approval when required, then render, master, store, and verify the exact audio.</span></div>
          <div><b>Forge persistent carousel</b><span>Generate the complete carousel, doctrine-check it, save an editable Creative Project, render 1080×1350 review PNGs, and stop before scheduling or publishing.</span></div>
          <div><b>Pathway audio → YouTube</b><span>Validate approved audio, build the video project and publishing kit, queue the renderer, then stop for finished-video review.</span></div>
          <div><b>Journey + automation draft</b><span>Create or reuse disabled automation and draft journey state, link the project, and stop before activation or messaging.</span></div>
        </div>
      </section>

      <section className="sol-v3-control-card">
        <div className="sol-v3-control-card-head"><ShieldCheck size={16}/><div><span>Hard locks</span><h3>Forge cannot quietly cross these lines.</h3></div></div>
        <div className="sol-v3-control-checks">
          <span><CheckCircle2 size={13}/> No live publishing</span>
          <span><CheckCircle2 size={13}/> No automatic narration approval</span>
          <span><CheckCircle2 size={13}/> No automation activation</span>
          <span><CheckCircle2 size={13}/> No outbound messaging or enrollment</span>
          <span><CheckCircle2 size={13}/> No canonical Pathway doctrine edits</span>
          <span><CheckCircle2 size={13}/> No “done” without persisted evidence</span>
        </div>
      </section>
    </div>

    <section className="sol-v3-control-footer">
      <div><strong>Want the system contract?</strong><span>The V4 Forge behavior, authority model, recovery rules, review gates, storage evidence, tests, and maintenance policy are documented in the repo.</span></div>
      <Link href="/admin/health">Check Studio health</Link>
    </section>
  </div>;
}
