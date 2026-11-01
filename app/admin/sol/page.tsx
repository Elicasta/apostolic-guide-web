import Link from "next/link";
import { redirect } from "next/navigation";
import { Activity, Bot, BrainCircuit, CheckCircle2, Clock3, Gauge, ShieldCheck, Sparkles, TriangleAlert, Users } from "lucide-react";
import { getStudioPermission } from "@/auth";
import { getSolAgentTeamSnapshot } from "@/sol-agent-team";
import { getSolOperatorSnapshot } from "@/sol-operator";

export default async function SolOperatorPage() {
  const permission = await getStudioPermission("view_workspace");
  const localSetup = permission.access.state === "unconfigured";
  if (!permission.allowed && !localSetup) redirect("/admin");

  const [snapshot, team] = await Promise.all([getSolOperatorSnapshot(), getSolAgentTeamSnapshot()]);
  const currentAttention = team.agents.filter((agent) => agent.state === "attention" || agent.state === "blocked");
  const working = team.agents.filter((agent) => agent.state === "working");
  const pending = snapshot.proposals.filter((proposal) => proposal.status === "pending");
  const review = snapshot.runs.filter((run) => run.status === "waiting_review");
  const behind = snapshot.kpis.filter((kpi) => kpi.actual < kpi.target);

  return <div className="sol-v3-control-page">
    <div className="studio-page-heading sol-workspace-heading">
      <div>
        <span className="eyebrow">Apostolic Guide operations</span>
        <h1>Sol Manager</h1>
        <p className="admin-lede">Sol coordinates the operating team. Atlas watches content coverage. Forge moves production. Relay watches distribution. Sentinel protects doctrine and system integrity. Shepherd watches stored people and journey evidence. Compass ranks what matters next.</p>
      </div>
      <span className="studio-role-badge">Manager · 6 specialists</span>
    </div>

    <section className="sol-v3-control-hero">
      <div className="sol-v3-control-hero-copy">
        <span><BrainCircuit size={15}/> LIVE MANAGER INTELLIGENCE</span>
        <h2>One manager. Six specialist lanes. Current evidence only.</h2>
        <p>The floating Sol manager is the daily operating surface. It reads the same production, publishing, doctrine, people, journey, and KPI state shown here, then coordinates registered tools and Forge execution without inventing browser work.</p>
        <div className="sol-v3-control-example">Ask: <strong>“What is behind, what can your agents fix without me, and what are the three things only I need to approve?”</strong></div>
      </div>
      <div className={`sol-v3-control-state is-${snapshot.settings.enabled ? snapshot.settings.mode : "off"}`}>
        <i/>
        <span>{snapshot.settings.enabled ? snapshot.settings.mode : "execution off"}</span>
        <small>Intelligence active · refreshed {new Date(team.generatedAt).toLocaleTimeString()}</small>
        <small>{snapshot.settings.enabled ? "Execution follows the active mode." : "All six specialists still observe while execution is paused."}</small>
      </div>
    </section>

    <section className="sol-v3-control-metrics" aria-label="Sol manager state">
      <article><Bot size={17}/><div><strong>{team.agents.length}</strong><span>Specialist agents</span></div></article>
      <article><Activity size={17}/><div><strong>{working.length}</strong><span>Agents working</span></div></article>
      <article className={currentAttention.length ? "is-warn" : ""}><TriangleAlert size={17}/><div><strong>{currentAttention.length}</strong><span>Agents need attention</span></div></article>
      <article><Clock3 size={17}/><div><strong>{review.length}</strong><span>Real review gates</span></div></article>
      <article className={behind.length ? "is-warn" : ""}><Gauge size={17}/><div><strong>{behind.length}</strong><span>KPIs behind</span></div></article>
    </section>

    <div className="sol-v3-control-grid">
      <section className="sol-v3-control-card">
        <div className="sol-v3-control-card-head"><Users size={16}/><div><span>Specialist team</span><h3>Each lane owns one operating problem.</h3></div></div>
        <div className="sol-v3-control-recipes">
          {team.agents.map((agent) => <div key={agent.key}><b>{agent.name} · {agent.role}</b><span>{agent.state.toUpperCase()} · {agent.nextAction}</span></div>)}
        </div>
      </section>

      <section className="sol-v3-control-card">
        <div className="sol-v3-control-card-head"><BrainCircuit size={16}/><div><span>Manager loop</span><h3>Observe → reconcile → prioritize → execute → verify.</h3></div></div>
        <div className="sol-v3-control-checks">
          <span><CheckCircle2 size={13}/> Intelligence stays active even when execution is paused</span>
          <span><CheckCircle2 size={13}/> Current runs are de-duplicated by recipe and Pathway</span>
          <span><CheckCircle2 size={13}/> Completed history stays out of the operating view</span>
          <span><CheckCircle2 size={13}/> Review work suppresses duplicate proposals</span>
          <span><CheckCircle2 size={13}/> Canonical hashes decide whether content is actually current</span>
          <span><CheckCircle2 size={13}/> Manager intelligence refreshes on the recurring scan cycle</span>
        </div>
      </section>

      <section className="sol-v3-control-card">
        <div className="sol-v3-control-card-head"><ShieldCheck size={16}/><div><span>Execution authority</span><h3>Three modes. Intelligence is separate from power.</h3></div></div>
        <div className="sol-v3-control-modes">
          <div className={snapshot.settings.enabled && snapshot.settings.mode === "watch" ? "is-active" : ""}><b>Watch</b><span>Agents read, reconcile, prioritize, and explain. No production mutation runs.</span></div>
          <div className={snapshot.settings.enabled && snapshot.settings.mode === "assist" ? "is-active" : ""}><b>Assist</b><span>Agents prepare registered work and pause at approval boundaries.</span></div>
          <div className={snapshot.settings.enabled && snapshot.settings.mode === "trusted" ? "is-active" : ""}><b>Trusted</b><span>Allowlisted internal safe-draft jobs may run automatically. Review and external effects still stop.</span></div>
        </div>
      </section>

      <section className="sol-v3-control-card">
        <div className="sol-v3-control-card-head"><Clock3 size={16}/><div><span>What is live now</span><h3>Current operating pressure.</h3></div></div>
        <div className="sol-v3-control-recipes">
          {team.priorities.length ? team.priorities.slice(0, 6).map((item) => <div key={`${item.severity}-${item.label}`}><b>{item.label}</b><span>{item.severity.toUpperCase()} · {item.detail}</span></div>) : <div><b>No manager priority flagged</b><span>The specialist team is watching for the next real state change.</span></div>}
        </div>
      </section>

      <section className="sol-v3-control-card">
        <div className="sol-v3-control-card-head"><Sparkles size={16}/><div><span>Real execution</span><h3>Registered jobs, not chat theater.</h3></div></div>
        <div className="sol-v3-control-recipes">
          <div><b>Forge Pathway audio</b><span>Prepare current narration, preserve doctrine approval, render verified lossless audio when prerequisites pass.</span></div>
          <div><b>Forge persistent carousel</b><span>Generate complete deck copy, doctrine-check it, save a persistent Creative Project, render review PNGs, then stop before scheduling.</span></div>
          <div><b>Pathway audio → YouTube</b><span>Build timed video, publishing kit, render, then stop before live publishing.</span></div>
          <div><b>Journey + automation draft</b><span>Create disabled automation and draft journey state, then stop before activation, enrollment, or messaging.</span></div>
          <div><b>{pending.length} current proposals</b><span>Only reconciled work should remain in the queue.</span></div>
        </div>
      </section>

      <section className="sol-v3-control-card">
        <div className="sol-v3-control-card-head"><ShieldCheck size={16}/><div><span>Hard locks</span><h3>More intelligence does not erase the gates.</h3></div></div>
        <div className="sol-v3-control-checks">
          <span><CheckCircle2 size={13}/> No silent live publishing</span>
          <span><CheckCircle2 size={13}/> No automatic narration approval</span>
          <span><CheckCircle2 size={13}/> No automation activation</span>
          <span><CheckCircle2 size={13}/> No outbound messaging or enrollment</span>
          <span><CheckCircle2 size={13}/> No canonical Pathway doctrine edits</span>
          <span><CheckCircle2 size={13}/> No stale content counted as done</span>
          <span><CheckCircle2 size={13}/> No duplicate paid generation when a current artifact exists</span>
        </div>
      </section>
    </div>

    <section className="sol-v3-control-footer">
      <div><strong>Operational contract</strong><span>The manager architecture, specialist roles, Forge production rules, source graph, people boundaries, recovery rules, and review gates are documented in the repo.</span></div>
      <Link href="/admin/health">Check Studio health</Link>
    </section>
  </div>;
}
