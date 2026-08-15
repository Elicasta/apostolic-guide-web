"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Activity, ArrowRight, Check, ChevronDown, CircleAlert, Gauge, Loader2, MessageSquareText, Pause, Play, RefreshCw, Send, Settings2, ShieldCheck, Sparkles, X } from "lucide-react";
import type { SolOperatorSnapshot, SolProposal, SolRun } from "./sol-operator";
import type { SolMode } from "./sol-operator-engine";

type ApiResponse = { error?: string; message?: string; snapshot?: SolOperatorSnapshot } & Partial<SolOperatorSnapshot>;
type ChatLine = { id: string; role: "user" | "sol"; text: string };

const MODE_COPY: Record<SolMode, string> = {
  watch: "Finds gaps and reports them. Nothing runs.",
  assist: "Runs only work you approve. Publishing stays locked.",
  trusted: "Reserved for proven recipes. Phase 1 still stops at review."
};

function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

function relativeTime(value: string | null) {
  if (!value) return "Never";
  const delta = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(delta) || delta < 0) return "Just now";
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function SolRobotAvatar({ state = "idle", small = false }: { state?: "idle" | "thinking" | "running" | "attention" | "off"; small?: boolean }) {
  return <span className={`sol-robot is-${state}${small ? " is-small" : ""}`} aria-hidden="true">
    <span className="sol-robot-antenna"><i/></span>
    <span className="sol-robot-ear is-left"/><span className="sol-robot-ear is-right"/>
    <span className="sol-robot-head">
      <span className="sol-robot-eyes"><i/><i/></span>
      <span className="sol-robot-mouth"/>
    </span>
    <span className="sol-robot-status"/>
  </span>;
}

async function request(body?: Record<string, unknown>) {
  const response = await fetch("/api/admin/sol", body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const data = await response.json().catch(() => ({})) as ApiResponse;
  if (!response.ok) throw new Error(data.error || `Sol request failed (${response.status}).`);
  return data.snapshot ?? data as SolOperatorSnapshot;
}

function SolStatus({ snapshot }: { snapshot: SolOperatorSnapshot }) {
  const running = snapshot.runs.filter((run) => run.status === "running" || run.status === "queued").length;
  const pending = snapshot.proposals.filter((proposal) => proposal.status === "pending").length;
  return <div className="sol-status-strip">
    <span className={snapshot.settings.enabled ? "is-on" : "is-off"}><i/>{snapshot.settings.enabled ? snapshot.settings.mode : "off"}</span>
    <span>{pending} proposed</span>
    <span>{running} running</span>
    <span>Scan {relativeTime(snapshot.settings.lastScanAt)}</span>
  </div>;
}

function KpiGrid({ snapshot }: { snapshot: SolOperatorSnapshot }) {
  return <div className="sol-kpi-grid">
    {snapshot.kpis.map((kpi) => {
      const met = kpi.actual >= kpi.target;
      const width = kpi.target ? Math.min(100, Math.round((kpi.actual / kpi.target) * 100)) : 100;
      return <article key={kpi.key} className={met ? "is-met" : "is-behind"}>
        <div><span>{kpi.label}</span><strong>{kpi.actual}<small> / {kpi.target}</small></strong></div>
        <i><b style={{ width: `${width}%` }}/></i>
        <small>{met ? "On target" : `${Math.max(0, kpi.target - kpi.actual)} behind this week`}</small>
      </article>;
    })}
  </div>;
}

function ProposalCard({ proposal, busy, canOperate, onApprove, onDismiss }: { proposal: SolProposal; busy: string | null; canOperate: boolean; onApprove: (proposal: SolProposal) => void; onDismiss: (proposal: SolProposal) => void }) {
  const [expanded, setExpanded] = useState(false);
  return <article className={`sol-proposal is-${proposal.priority}`}>
    <div className="sol-proposal-top">
      <span className="sol-proposal-icon"><Sparkles size={15}/></span>
      <div><span className="sol-proposal-meta">{proposal.priority} · {proposal.risk.replaceAll("_", " ")}</span><strong>{proposal.title}</strong><p>{proposal.summary}</p></div>
      <button type="button" className="sol-icon-button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} aria-label={expanded ? "Hide proposal details" : "Show proposal details"}><ChevronDown className={expanded ? "is-open" : ""} size={17}/></button>
    </div>
    <div className="sol-evidence">{proposal.evidence.map((item) => <span className={`is-${item.state ?? "info"}`} key={item.label}><b>{item.value}</b>{item.label}</span>)}</div>
    {expanded ? <div className="sol-proposal-detail">
      <ol>{proposal.plan.map((step) => <li key={step.key}><i>{step.gate === "theology" ? <ShieldCheck size={13}/> : step.gate === "review" ? <Pause size={13}/> : <Check size={13}/>}</i><span>{step.label}<small>{step.gate}</small></span></li>)}</ol>
      <div className="sol-constraints"><strong>Built-in constraints</strong>{proposal.suggestedConstraints.map((item) => <span key={item}>{item}</span>)}</div>
    </div> : null}
    {proposal.status === "pending" ? <div className="sol-proposal-actions">
      <button type="button" className="button" disabled={!canOperate || Boolean(busy)} onClick={() => onDismiss(proposal)}>Dismiss</button>
      <button type="button" className="button button-crimson" disabled={!canOperate || Boolean(busy)} onClick={() => onApprove(proposal)}>{busy === proposal.id ? <Loader2 className="spin" size={14}/> : <Play size={14}/>} Run with gates</button>
    </div> : <span className={`sol-proposal-state is-${proposal.status}`}>{statusLabel(proposal.status)}</span>}
  </article>;
}

function RunRow({ run, onCancel, busy }: { run: SolRun; onCancel: (run: SolRun) => void; busy: string | null }) {
  const active = run.status === "running" || run.status === "queued";
  const href = typeof run.result.href === "string" ? run.result.href : null;
  return <article className={`sol-run is-${run.status}`}>
    <div className="sol-run-head"><span>{active ? <Loader2 className="spin" size={14}/> : run.status === "failed" ? <CircleAlert size={14}/> : <Check size={14}/>}</span><div><strong>{run.inputs.proposalTitle ? String(run.inputs.proposalTitle) : statusLabel(run.recipeKey)}</strong><small>{run.pathwaySlug || "workspace"} · {statusLabel(run.status)}</small></div><b>{run.progress}%</b></div>
    <i className="sol-progress"><b style={{ width: `${run.progress}%` }}/></i>
    <p>{run.error || run.steps.find((step) => step.key === run.currentStep)?.detail || `Current step: ${statusLabel(run.currentStep || run.status)}`}</p>
    <div className="sol-run-actions">
      {active ? <button type="button" onClick={() => onCancel(run)} disabled={busy === run.id}><X size={13}/> Cancel</button> : null}
      {href ? <Link href={href}>Review result <ArrowRight size={13}/></Link> : null}
    </div>
  </article>;
}

function OperatorPanel({ initialSnapshot, canOperate, embedded = false, onClose }: { initialSnapshot?: SolOperatorSnapshot; canOperate: boolean; embedded?: boolean; onClose?: () => void }) {
  const [snapshot, setSnapshot] = useState<SolOperatorSnapshot | null>(initialSnapshot ?? null);
  const [tab, setTab] = useState<"today" | "runs" | "kpis" | "settings">("today");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [chat, setChat] = useState<ChatLine[]>([{ id: "welcome", role: "sol", text: "I can scan the workspace, explain what is missing, and run approved recipes. I will stop before publishing or activating anything." }]);

  const load = useCallback(async () => {
    try { setSnapshot(await request()); setError(""); } catch (reason) { setError(reason instanceof Error ? reason.message : "Sol could not load."); }
  }, []);
  useEffect(() => {
    if (snapshot) return;
    let cancelled = false;
    void request().then((next) => {
      if (!cancelled) { setSnapshot(next); setError(""); }
    }).catch((reason) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : "Sol could not load.");
    });
    return () => { cancelled = true; };
  }, [snapshot]);
  useEffect(() => {
    if (!snapshot?.runs.some((run) => run.status === "running" || run.status === "queued")) return;
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
  }, [load, snapshot?.runs]);

  const act = useCallback(async (key: string, body: Record<string, unknown>) => {
    setBusy(key); setError("");
    try { const next = await request(body); setSnapshot(next); return next; }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Sol could not complete that request."); return null; }
    finally { setBusy(null); }
  }, []);

  const pending = useMemo(() => snapshot?.proposals.filter((proposal) => proposal.status === "pending") ?? [], [snapshot]);
  const recentRuns = useMemo(() => snapshot?.runs.slice(0, 10) ?? [], [snapshot]);
  const robotState = !snapshot?.settings.enabled ? "off" : busy ? "thinking" : recentRuns.some((run) => run.status === "running" || run.status === "queued") ? "running" : pending.length ? "attention" : "idle";

  async function sendChat(event: FormEvent) {
    event.preventDefault();
    const text = message.trim();
    if (!text || busy) return;
    const userLine = { id: crypto.randomUUID(), role: "user" as const, text };
    setChat((lines) => [...lines, userLine]); setMessage(""); setBusy("chat"); setError("");
    try {
      const response = await fetch("/api/admin/sol", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "chat", message: text }) });
      const data = await response.json().catch(() => ({})) as ApiResponse;
      if (!response.ok) throw new Error(data.error || "Sol could not interpret that request.");
      if (data.snapshot) setSnapshot(data.snapshot);
      setChat((lines) => [...lines, { id: crypto.randomUUID(), role: "sol", text: data.message || "Done." }]);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Sol chat failed."); }
    finally { setBusy(null); }
  }

  if (!snapshot) return <section className={`sol-panel${embedded ? " is-embedded" : ""}`}><div className="sol-loading"><SolRobotAvatar state="thinking"/><Loader2 className="spin" size={18}/><span>Reading Studio state…</span></div></section>;

  return <section className={`sol-panel${embedded ? " is-embedded" : ""}`} aria-label="Sol Content Operator">
    <header className="sol-panel-head">
      <div className="sol-head-identity"><SolRobotAvatar state={robotState}/><span><strong>Sol</strong><small>Content Operator · Phase 1</small></span></div>
      <div className="sol-head-actions">
        <button type="button" className={`sol-master-toggle${snapshot.settings.enabled ? " is-on" : ""}`} disabled={!canOperate || busy === "settings"} onClick={() => void act("settings", { action: "update_settings", enabled: !snapshot.settings.enabled, mode: snapshot.settings.mode, weeklyTargets: snapshot.settings.weeklyTargets })} aria-pressed={snapshot.settings.enabled}><i/><span>{snapshot.settings.enabled ? "On" : "Off"}</span></button>
        {!embedded && onClose ? <button type="button" className="sol-icon-button" onClick={onClose} aria-label="Close Sol"><X size={18}/></button> : null}
      </div>
    </header>
    <SolStatus snapshot={snapshot}/>
    {!snapshot.dbReady ? <div className="sol-alert"><CircleAlert size={16}/><div><strong>Sol database is not ready.</strong><p>Apply the Phase 1 migration before turning the operator on.</p></div></div> : null}
    {error ? <div className="sol-alert is-error"><CircleAlert size={16}/><span>{error}</span></div> : null}
    <nav className="sol-tabs" aria-label="Sol sections">
      <button type="button" onClick={() => setTab("today")} className={tab === "today" ? "is-active" : ""}>Today{pending.length ? <span>{pending.length}</span> : null}</button>
      <button type="button" onClick={() => setTab("runs")} className={tab === "runs" ? "is-active" : ""}>Runs</button>
      <button type="button" onClick={() => setTab("kpis")} className={tab === "kpis" ? "is-active" : ""}>KPIs</button>
      <button type="button" onClick={() => setTab("settings")} className={tab === "settings" ? "is-active" : ""} aria-label="Sol settings"><Settings2 size={14}/></button>
    </nav>
    <div className="sol-panel-scroll">
      {tab === "today" ? <>
        <div className="sol-section-title"><div><span>Work proposals</span><strong>What Sol recommends next</strong></div><button type="button" onClick={() => void act("scan", { action: "scan" })} disabled={!canOperate || Boolean(busy)}>{busy === "scan" ? <Loader2 className="spin" size={14}/> : <RefreshCw size={14}/>} Scan now</button></div>
        {pending.length ? <div className="sol-proposal-list">{pending.map((proposal) => <ProposalCard key={proposal.id} proposal={proposal} busy={busy} canOperate={canOperate && snapshot.settings.enabled && snapshot.settings.mode !== "watch"} onApprove={(item) => void act(item.id, { action: "approve", proposalId: item.id, constraints: item.suggestedConstraints })} onDismiss={(item) => void act(item.id, { action: "dismiss", proposalId: item.id })}/>)}</div> : <div className="sol-empty"><ShieldCheck size={24}/><strong>No proposals are waiting.</strong><p>{snapshot.settings.lastScanAt ? "The last scan found no new allowlisted work." : "Turn Sol on and run the first scan."}</p></div>}
      </> : null}
      {tab === "runs" ? <>
        <div className="sol-section-title"><div><span>Execution ledger</span><strong>Approved work</strong></div><button type="button" onClick={() => void load()}><RefreshCw size={14}/> Refresh</button></div>
        {recentRuns.length ? <div className="sol-run-list">{recentRuns.map((run) => <RunRow key={run.id} run={run} busy={busy} onCancel={(item) => void act(item.id, { action: "cancel_run", runId: item.id })}/>)}</div> : <div className="sol-empty"><Activity size={24}/><strong>No runs yet.</strong><p>Approved proposals will appear here with live progress.</p></div>}
      </> : null}
      {tab === "kpis" ? <>
        <div className="sol-section-title"><div><span>Weekly targets</span><strong>Publishing pace</strong></div><Gauge size={17}/></div>
        <KpiGrid snapshot={snapshot}/>
        <div className="sol-coverage"><strong>Pathway coverage</strong><div><span><b>{snapshot.coverage.audioReady}</b> Audio ready</span><span><b>{snapshot.coverage.youtubePublished}</b> YouTube</span><span><b>{snapshot.coverage.carouselPublished}</b> Carousels</span><span><b>{snapshot.coverage.automationsLinked}</b> Automations</span></div><small>Measured across {snapshot.coverage.pathways} canonical Pathways.</small></div>
      </> : null}
      {tab === "settings" ? <>
        <div className="sol-section-title"><div><span>Guardrails</span><strong>Operating mode</strong></div><ShieldCheck size={17}/></div>
        <div className="sol-mode-list">{(["watch", "assist", "trusted"] as SolMode[]).map((mode) => <button type="button" key={mode} disabled={!canOperate || Boolean(busy)} className={snapshot.settings.mode === mode ? "is-active" : ""} onClick={() => void act("settings", { action: "update_settings", enabled: true, mode, weeklyTargets: snapshot.settings.weeklyTargets })}><i>{snapshot.settings.mode === mode ? <Check size={13}/> : null}</i><span><strong>{mode}</strong><small>{MODE_COPY[mode]}</small></span></button>)}</div>
        <div className="sol-hard-locks"><strong>Phase 1 hard locks</strong><span><ShieldCheck size={14}/> No live publishing</span><span><ShieldCheck size={14}/> No automation activation</span><span><ShieldCheck size={14}/> No messages or enrollments</span><span><ShieldCheck size={14}/> No canonical Pathway edits</span></div>
      </> : null}
    </div>
    <div className="sol-chat">
      <div className="sol-chat-lines">{chat.slice(-4).map((line) => <p className={`is-${line.role}`} key={line.id}>{line.role === "sol" ? <SolRobotAvatar state={busy === "chat" ? "thinking" : robotState} small/> : null}<span>{line.text}</span></p>)}</div>
      <form onSubmit={sendChat}><MessageSquareText size={15}/><input value={message} onChange={(event) => setMessage(event.target.value)} placeholder={canOperate ? "Ask Sol or approve work…" : "Read-only access"} disabled={!canOperate || Boolean(busy)}/><button type="submit" disabled={!message.trim() || Boolean(busy)} aria-label="Send to Sol">{busy === "chat" ? <Loader2 className="spin" size={15}/> : <Send size={15}/>}</button></form>
      <small>Sol can run registered recipes only. External effects stay locked.</small>
    </div>
  </section>;
}

export function SolOperatorFloating({ canOperate }: { canOperate: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<SolOperatorSnapshot | undefined>();
  useEffect(() => { void request().then(setSnapshot).catch(() => undefined); }, []);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    if (window.innerWidth <= 640) document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open]);
  if (pathname === "/admin/sol") return null;
  const state = !snapshot?.settings.enabled ? "idle" : snapshot.runs.some((run) => run.status === "running" || run.status === "queued") ? "running" : snapshot.proposals.some((proposal) => proposal.status === "pending") ? "attention" : "idle";
  return <div className={`sol-floating${open ? " is-open" : ""}`}>
    {open ? <><button type="button" className="sol-backdrop" onClick={() => setOpen(false)} aria-label="Close Sol"/><OperatorPanel initialSnapshot={snapshot} canOperate={canOperate} onClose={() => setOpen(false)}/></> : null}
    <button type="button" className="sol-launcher" onClick={() => setOpen(true)} aria-label="Open Sol Content Operator" aria-expanded={open}><SolRobotAvatar state={state}/><span>Ask Sol</span></button>
  </div>;
}

export function SolOperatorWorkspace({ initialSnapshot, canOperate }: { initialSnapshot: SolOperatorSnapshot; canOperate: boolean }) {
  return <OperatorPanel initialSnapshot={initialSnapshot} canOperate={canOperate} embedded/>;
}
