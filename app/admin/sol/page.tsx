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
        <p className="admin-lede">The floating Sol sidecar is the operator. This page is the control room: current state, operating policy, recovery status, and the registered work Sol is allowed to move.</p>
      </div>
      <span className="studio-role-badge">V3 · Durable agent kernel</span>
    </div>

    <section className="sol-v3-control-hero">
      <div className="sol-v3-control-hero-copy">
        <span><Bot size={15}/> SOL STUDIO AGENT</span>
        <h2>Ask for an outcome, not a sequence of clicks.</h2>
        <p>Open <strong>Ask Sol</strong> in the lower-right corner from any admin screen. Sol can inspect current Studio state, use several registered tools in one turn, preserve the conversation across pages, and hand long work to durable runs instead of holding the chat open.</p>
        <div className="sol-v3-control-example">Try: <strong>“Find anything stuck in Studio, recover what is safely recoverable, and tell me what still needs me.”</strong></div>
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
      <article><Clock3 size={17}/><div><strong>{review.length}</strong><span>Waiting review</span></div></article>
      <article className={trouble.length ? "is-alert" : ""}><TriangleAlert size={17}/><div><strong>{trouble.length}</strong><span>Failed or stalled</span></div></article>
      <article className={behind.length ? "is-warn" : ""}><Gauge size={17}/><div><strong>{behind.length}</strong><span>KPIs behind</span></div></article>
    </section>

    <div className="sol-v3-control-grid">
      <section className="sol-v3-control-card">
        <div className="sol-v3-control-card-head"><ShieldCheck size={16}/><div><span>Authority model</span><h3>Three modes. Server owns the boundary.</h3></div></div>
        <div className="sol-v3-control-modes">
          <div className={snapshot.settings.enabled && snapshot.settings.mode === "watch" ? "is-active" : ""}><b>Watch</b><span>Reads, scans, diagnoses, and proposes. It does not execute work.</span></div>
          <div className={snapshot.settings.enabled && snapshot.settings.mode === "assist" ? "is-active" : ""}><b>Assist</b><span>Prepares registered actions and stops for human approval before mutation.</span></div>
          <div className={snapshot.settings.enabled && snapshot.settings.mode === "trusted" ? "is-active" : ""}><b>Trusted</b><span>May auto-run only server-allowlisted safe drafts. Review-required work still stops.</span></div>
        </div>
      </section>

      <section className="sol-v3-control-card">
        <div className="sol-v3-control-card-head"><Activity size={16}/><div><span>Execution model</span><h3>No more immortal spinners.</h3></div></div>
        <div className="sol-v3-control-checks">
          <span><CheckCircle2 size={13}/> Worker lease + heartbeat</span>
          <span><CheckCircle2 size={13}/> Internal request timeout</span>
          <span><CheckCircle2 size={13}/> Retry with bounded backoff</span>
          <span><CheckCircle2 size={13}/> Explicit stalled state</span>
          <span><CheckCircle2 size={13}/> One-minute recovery worker</span>
          <span><CheckCircle2 size={13}/> Authenticated manual Retry where browser context is required</span>
        </div>
      </section>

      <section className="sol-v3-control-card">
        <div className="sol-v3-control-card-head"><Sparkles size={16}/><div><span>Registered work</span><h3>Recipes Sol can actually execute.</h3></div></div>
        <div className="sol-v3-control-recipes">
          <div><b>Pathway audio → YouTube</b><span>Validate theology and exact audio, build project, create publishing kit, queue render, stop for review.</span></div>
          <div><b>Carousel topic pack</b><span>Build from canonical Pathway steps, generate decks, doctrine-check, save drafts, stop before publishing.</span></div>
          <div><b>Journey + automation draft</b><span>Create or reuse disabled automation and draft journey, link project, stop before activation.</span></div>
        </div>
      </section>

      <section className="sol-v3-control-card">
        <div className="sol-v3-control-card-head"><ShieldCheck size={16}/><div><span>Hard locks</span><h3>Sol still cannot cross these lines.</h3></div></div>
        <div className="sol-v3-control-checks">
          <span><CheckCircle2 size={13}/> No live publishing</span>
          <span><CheckCircle2 size={13}/> No automation activation</span>
          <span><CheckCircle2 size={13}/> No outbound messaging or enrollment</span>
          <span><CheckCircle2 size={13}/> No canonical Pathway doctrine edits</span>
          <span><CheckCircle2 size={13}/> No invented browser clicks</span>
          <span><CheckCircle2 size={13}/> No “done” without tool evidence</span>
        </div>
      </section>
    </div>

    <section className="sol-v3-control-footer">
      <div><strong>Want the system contract?</strong><span>The V3 behavior, recovery model, approval contract, failure rules, tests, and maintenance policy are documented in the repo.</span></div>
      <Link href="/admin/health">Check Studio health</Link>
    </section>
  </div>;
}
