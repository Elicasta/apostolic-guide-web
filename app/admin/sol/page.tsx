import Link from "next/link";
import { redirect } from "next/navigation";
import { Activity, Bot, CheckCircle2, Clock3, Gauge, ShieldCheck, Sparkles, TriangleAlert } from "lucide-react";
import { getStudioPermission } from "@/auth";
import { getSolOperatorSnapshot } from "@/sol-operator";
import { listPendingSolRuntimeReviews } from "@/sol-runtime-review";

export default async function SolOperatorPage() {
  const permission = await getStudioPermission("view_workspace");
  const localSetup = permission.access.state === "unconfigured";
  if (!permission.allowed && !localSetup) redirect("/admin");

  const [snapshot, runtimeReviews] = await Promise.all([
    getSolOperatorSnapshot(),
    listPendingSolRuntimeReviews(100).catch(() => [])
  ]);
  const pending = snapshot.proposals.filter((proposal) => proposal.status === "pending");
  const active = snapshot.runs.filter((run) => ["queued", "running", "retrying"].includes(run.status));
  const trouble = snapshot.runs.filter((run) => run.status === "failed" || run.status === "stalled");
  const behind = snapshot.kpis.filter((kpi) => kpi.actual < kpi.target);

  return <div className="sol-v3-control-page">
    <div className="studio-page-heading sol-workspace-heading">
      <div>
        <span className="eyebrow">Studio operations</span>
        <h1>Sol Control Center</h1>
        <p className="admin-lede">The floating Sol sidecar is the cockpit. SOL Runtime owns execution state underneath it: durable tasks, exact review gates, recovery, and authority policy.</p>
      </div>
      <span className="studio-role-badge">Runtime V1 · migration active</span>
    </div>

    <section className="sol-v3-control-hero">
      <div className="sol-v3-control-hero-copy">
        <span><Bot size={15}/> SOL STUDIO AGENT</span>
        <h2>Ask for an outcome, not a sequence of clicks.</h2>
        <p>Open <strong>Ask Sol</strong> in the lower-right corner from any admin screen. The Brain decides where judgment is needed. Registered workflows and deterministic software do the repeatable work.</p>
        <div className="sol-v3-control-example">Runtime rule: <strong>AI decides. Code executes. Verifiers prove. Approvals authorize.</strong></div>
      </div>
      <div className={`sol-v3-control-state is-${snapshot.settings.enabled ? snapshot.settings.mode : "off"}`}>
        <i/>
        <span>{snapshot.settings.enabled ? snapshot.settings.mode : "off"}</span>
        <small>Last scan {snapshot.settings.lastScanAt ? new Date(snapshot.settings.lastScanAt).toLocaleString() : "not run"}</small>
      </div>
    </section>

    <section className="sol-v3-control-metrics" aria-label="Sol current state">
      <article><Sparkles size={17}/><div><strong>{pending.length}</strong><span>Proposals waiting</span></div></article>
      <article><Activity size={17}/><div><strong>{active.length}</strong><span>Runs moving</span></div></article>
      <article><Clock3 size={17}/><div><strong>{runtimeReviews.length}</strong><span>Runtime reviews</span></div></article>
      <article className={trouble.length ? "is-alert" : ""}><TriangleAlert size={17}/><div><strong>{trouble.length}</strong><span>Failed or stalled</span></div></article>
      <article className={behind.length ? "is-warn" : ""}><Gauge size={17}/><div><strong>{behind.length}</strong><span>KPIs behind</span></div></article>
    </section>

    {runtimeReviews.length ? <section className="sol-v3-control-footer">
      <div><strong>{runtimeReviews.length} {runtimeReviews.length === 1 ? "artifact needs" : "artifacts need"} you.</strong><span>Review is now a persisted execution gate. Runs remain unfinished until the decision is saved.</span></div>
      <Link href="/admin/sol/reviews">Open review queue</Link>
    </section> : null}

    <div className="sol-v3-control-grid">
      <section className="sol-v3-control-card">
        <div className="sol-v3-control-card-head"><ShieldCheck size={16}/><div><span>Authority model</span><h3>Three modes. Runtime owns the boundary.</h3></div></div>
        <div className="sol-v3-control-modes">
          <div className={snapshot.settings.enabled && snapshot.settings.mode === "watch" ? "is-active" : ""}><b>Watch</b><span>Reads, scans, diagnoses, and proposes. It does not mutate.</span></div>
          <div className={snapshot.settings.enabled && snapshot.settings.mode === "assist" ? "is-active" : ""}><b>Assist</b><span>Prepares work and stops at runtime approvals before authority-sensitive mutations.</span></div>
          <div className={snapshot.settings.enabled && snapshot.settings.mode === "trusted" ? "is-active" : ""}><b>Trusted</b><span>May auto-run only allowlisted safe workflows. Publishing, deletion, financial, and security authority stay gated.</span></div>
        </div>
      </section>

      <section className="sol-v3-control-card">
        <div className="sol-v3-control-card-head"><Activity size={16}/><div><span>Execution model</span><h3>State survives the browser.</h3></div></div>
        <div className="sol-v3-control-checks">
          <span><CheckCircle2 size={13}/> Runtime run + task state</span>
          <span><CheckCircle2 size={13}/> Worker leases + heartbeats</span>
          <span><CheckCircle2 size={13}/> Atomic task claiming</span>
          <span><CheckCircle2 size={13}/> Retry schedule + bounded backoff</span>
          <span><CheckCircle2 size={13}/> Idempotency identities</span>
          <span><CheckCircle2 size={13}/> Structured events + attempts</span>
        </div>
      </section>

      <section className="sol-v3-control-card">
        <div className="sol-v3-control-card-head"><Sparkles size={16}/><div><span>Migration bridge</span><h3>Current recipes now stop at real runtime reviews.</h3></div></div>
        <div className="sol-v3-control-recipes">
          <div><b>Pathway audio → YouTube</b><span>Validates exact approved audio/script, prepares the project, queues render work, then creates an exact review object.</span></div>
          <div><b>Carousel topic pack</b><span>Builds from canonical Pathway data, doctrine-checks drafts, saves artifacts, then waits on persisted review.</span></div>
          <div><b>Journey + automation draft</b><span>Creates disabled drafts only, links the project, then waits on persisted review before any activation.</span></div>
        </div>
      </section>

      <section className="sol-v3-control-card">
        <div className="sol-v3-control-card-head"><ShieldCheck size={16}/><div><span>Hard locks</span><h3>Trusted is not unlimited authority.</h3></div></div>
        <div className="sol-v3-control-checks">
          <span><CheckCircle2 size={13}/> No silent live publishing</span>
          <span><CheckCircle2 size={13}/> No silent automation activation</span>
          <span><CheckCircle2 size={13}/> No outbound messaging or enrollment</span>
          <span><CheckCircle2 size={13}/> No canonical Pathway doctrine edits</span>
          <span><CheckCircle2 size={13}/> No arbitrary content as runtime policy</span>
          <span><CheckCircle2 size={13}/> No “complete” while review is pending</span>
        </div>
      </section>
    </div>

    <section className="sol-v3-control-footer">
      <div><strong>Review is now part of execution.</strong><span>The legacy recipes are being adopted incrementally while their history stays intact.</span></div>
      <Link href="/admin/sol/reviews">Review queue</Link>
    </section>
  </div>;
}
