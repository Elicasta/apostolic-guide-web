"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Bot,
  BrainCircuit,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  Loader2,
  MessageSquareText,
  Minimize2,
  Play,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Square,
  Users,
  X,
  Zap
} from "lucide-react";
import { getSolAdminSurface, type SolAdminSurface } from "@/sol-admin-context";
import { SolRobotAvatar } from "@/sol-operator-client";
import type { SolMode } from "@/sol-operator-engine";
import type { SolOperatorSnapshot, SolProposal, SolRun } from "@/sol-operator";

const TABS = [
  { key: "brief", label: "Manager", icon: BrainCircuit },
  { key: "agents", label: "Agents", icon: Bot },
  { key: "queue", label: "Queue", icon: Sparkles },
  { key: "activity", label: "Activity", icon: Activity }
] as const;

type TabKey = typeof TABS[number]["key"];
type BusyMap = Record<string, boolean>;
type AgentMessage = {
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  kind: "text" | "tool_call" | "tool_result" | "approval" | "status";
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};
type AgentApproval = {
  id: string;
  toolName: string;
  toolArguments: Record<string, unknown>;
  summary: string;
  risk: "safe_draft" | "review_required" | "external_effect";
  status: "pending" | "approved" | "rejected" | "expired";
  createdAt: string;
  resolvedAt: string | null;
};
type AgentThread = { id: string; currentPathname: string; messages: AgentMessage[]; approvals: AgentApproval[] };
type SpecialistAgent = {
  key: string;
  name: string;
  role: string;
  state: "working" | "watching" | "attention" | "blocked" | "idle";
  summary: string;
  nextAction: string;
  metrics: Array<{ label: string; value: number | string }>;
};
type AgentTeam = {
  generatedAt: string;
  intelligenceActive: true;
  executionEnabled: boolean;
  executionMode: "off" | "watch" | "assist" | "trusted";
  agents: SpecialistAgent[];
  priorities: Array<{ severity: "urgent" | "high" | "medium"; label: string; detail: string }>;
  hiddenHistoricalRuns: number;
};
type SolApiResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
  snapshot?: SolOperatorSnapshot;
  team?: AgentTeam;
  thread?: AgentThread | null;
  surface?: SolAdminSurface;
};

function timeAgo(value: string | null | undefined) {
  if (!value) return "never";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "unknown";
  const diff = Date.now() - parsed;
  if (diff < 45_000) return "now";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function isActiveRun(run: SolRun) {
  return ["queued", "running", "retrying"].includes(run.status);
}

function isAttentionRun(run: SolRun) {
  return ["waiting_review", "failed", "stalled"].includes(run.status);
}

function currentRunKey(run: SolRun) {
  return `${run.recipeKey}:${run.pathwaySlug ?? "workspace"}`;
}

function currentRuns(runs: SolRun[]) {
  const seen = new Set<string>();
  return runs.filter((run) => {
    if (!isActiveRun(run) && !isAttentionRun(run)) return false;
    const key = currentRunKey(run);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function toolLabel(name: string) {
  const labels: Record<string, string> = {
    get_workspace_status: "Reading workspace",
    get_content_inventory: "Counting current content",
    get_people_journey_status: "Reading journey state",
    get_current_screen: "Reading this screen",
    scan_workspace: "Running manager scan",
    list_proposals: "Reading queue",
    list_runs: "Reading execution",
    set_mode: "Changing mode",
    run_proposal: "Starting registered work",
    dismiss_proposal: "Clearing proposal",
    cancel_run: "Stopping work",
    retry_run: "Recovering work"
  };
  return labels[name] ?? name.replaceAll("_", " ");
}

async function fetchJson(url: string, options?: RequestInit, timeoutMs = 105_000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal, cache: "no-store" });
    const data = await response.json().catch(() => ({})) as SolApiResponse;
    if (!response.ok) throw new Error(data.error || `Sol request failed (${response.status}).`);
    return data;
  } finally {
    window.clearTimeout(timer);
  }
}

function managerRobotState(snapshot: SolOperatorSnapshot | null, team: AgentTeam | null, chatBusy: boolean) {
  if (chatBusy) return "thinking" as const;
  if (snapshot?.runs.some(isActiveRun) || team?.agents.some((agent) => agent.state === "working")) return "running" as const;
  if (team?.priorities.length || snapshot?.runs.some(isAttentionRun) || snapshot?.proposals.some((proposal) => proposal.status === "pending")) return "attention" as const;
  return "idle" as const;
}

function executionLabel(snapshot: SolOperatorSnapshot | null) {
  if (!snapshot?.settings.enabled) return "Execution paused";
  return `${snapshot.settings.mode[0].toUpperCase()}${snapshot.settings.mode.slice(1)} mode`;
}

function AgentCard({ agent }: { agent: SpecialistAgent }) {
  return <article className={`sol-mgr-agent is-${agent.state}`}>
    <div className="sol-mgr-agent-head">
      <span className="sol-mgr-agent-dot"/>
      <div><strong>{agent.name}</strong><small>{agent.role}</small></div>
      <b>{agent.state}</b>
    </div>
    <p>{agent.summary}</p>
    <div className="sol-mgr-agent-metrics">{agent.metrics.slice(0, 4).map((metric) => <span key={metric.label}><b>{metric.value}</b><small>{metric.label}</small></span>)}</div>
    <div className="sol-mgr-agent-next"><ChevronRight size={12}/><span>{agent.nextAction}</span></div>
  </article>;
}

function ProposalCard({ proposal, snapshot, busy, onRun, onDismiss }: {
  proposal: SolProposal;
  snapshot: SolOperatorSnapshot;
  busy: BusyMap;
  onRun: (proposal: SolProposal) => void;
  onDismiss: (proposal: SolProposal) => void;
}) {
  const executable = snapshot.settings.enabled && snapshot.settings.mode !== "watch";
  const actionLabel = !snapshot.settings.enabled ? "Start manager first" : snapshot.settings.mode === "watch" ? "Switch mode to run" : "Run now";
  return <article className={`sol-mgr-job is-${proposal.priority}`}>
    <div className="sol-mgr-job-head"><div><span>{proposal.risk.replaceAll("_", " ")}</span><strong>{proposal.title}</strong></div><b>{proposal.recipeKey.replaceAll("_", " ")}</b></div>
    <p>{proposal.summary}</p>
    <div className="sol-mgr-job-evidence">{proposal.evidence.slice(0, 3).map((item) => <span key={item.label}><b>{item.value}</b><small>{item.label}</small></span>)}</div>
    <div className="sol-mgr-job-actions">
      <button type="button" disabled={Boolean(busy[`dismiss:${proposal.id}`])} onClick={() => onDismiss(proposal)}><X size={12}/> Dismiss</button>
      <button type="button" className="is-primary" disabled={!executable || Boolean(busy[`run:${proposal.id}`])} onClick={() => onRun(proposal)}>{busy[`run:${proposal.id}`] ? <Loader2 className="is-spinning" size={12}/> : <Play size={12}/>} {actionLabel}</button>
    </div>
  </article>;
}

function RunCard({ run, busy, onCancel, onRetry }: {
  run: SolRun;
  busy: BusyMap;
  onCancel: (run: SolRun) => void;
  onRetry: (run: SolRun) => void;
}) {
  const href = typeof run.result.href === "string" ? run.result.href : null;
  const active = isActiveRun(run);
  const retryable = ["failed", "stalled", "retrying"].includes(run.status);
  return <article className={`sol-mgr-run is-${run.status}`}>
    <div className="sol-mgr-run-head"><div><span>{run.pathwaySlug || "workspace"}</span><strong>{String(run.inputs.proposalTitle || run.recipeKey.replaceAll("_", " "))}</strong></div><b>{run.status.replaceAll("_", " ")}</b></div>
    <div className="sol-mgr-progress"><i style={{ width: `${Math.max(2, run.progress)}%` }}/></div>
    <div className="sol-mgr-run-meta"><span>{run.progress}%</span><span>{run.currentStep?.replaceAll("_", " ") || "waiting"}</span><span>{timeAgo(run.updatedAt)} ago</span></div>
    {run.error ? <p className="sol-mgr-run-error"><CircleAlert size={12}/>{run.error}</p> : null}
    <div className="sol-mgr-run-actions">
      {active ? <button type="button" disabled={Boolean(busy[`cancel:${run.id}`])} onClick={() => onCancel(run)}><Square size={11}/> Stop</button> : null}
      {retryable ? <button type="button" disabled={Boolean(busy[`retry:${run.id}`])} onClick={() => onRetry(run)}>{busy[`retry:${run.id}`] ? <Loader2 className="is-spinning" size={11}/> : <RotateCcw size={11}/>} Retry</button> : null}
      {href ? <Link href={href}>Review <ChevronRight size={11}/></Link> : null}
    </div>
  </article>;
}

function ApprovalCard({ approval, busy, onDecision }: {
  approval: AgentApproval;
  busy: BusyMap;
  onDecision: (approval: AgentApproval, decision: "approved" | "rejected") => void;
}) {
  const key = `approval:${approval.id}`;
  return <article className="sol-mgr-approval">
    <ShieldCheck size={15}/>
    <div><span>{approval.risk.replaceAll("_", " ")}</span><strong>{approval.summary}</strong></div>
    <div><button type="button" disabled={Boolean(busy[key])} onClick={() => onDecision(approval, "rejected")}><X size={11}/></button><button type="button" className="is-approve" disabled={Boolean(busy[key])} onClick={() => onDecision(approval, "approved")}>{busy[key] ? <Loader2 className="is-spinning" size={11}/> : <Check size={11}/>} Approve</button></div>
  </article>;
}

function MessageRow({ message }: { message: AgentMessage }) {
  if (message.role === "tool") {
    const name = typeof message.metadata.toolName === "string" ? message.metadata.toolName : message.content;
    return <div className="sol-mgr-tool"><span>{message.kind === "tool_call" ? <Loader2 size={11}/> : message.metadata.ok === false ? <CircleAlert size={11}/> : <Check size={11}/>}</span><b>{message.kind === "tool_call" ? toolLabel(name) : message.content}</b><small>{timeAgo(message.createdAt)}</small></div>;
  }
  if (message.role !== "user" && message.role !== "assistant") return null;
  return <div className={`sol-mgr-message is-${message.role}`}>{message.role === "assistant" ? <SolRobotAvatar state="idle" small/> : null}<div><p>{message.content}</p><small>{timeAgo(message.createdAt)}</small></div></div>;
}

export function SolManagerSidecar({ canOperate }: { canOperate: boolean }) {
  const pathname = usePathname() || "/admin";
  const surface = useMemo(() => getSolAdminSurface(pathname), [pathname]);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabKey>("brief");
  const [snapshot, setSnapshot] = useState<SolOperatorSnapshot | null>(null);
  const [team, setTeam] = useState<AgentTeam | null>(null);
  const [thread, setThread] = useState<AgentThread | null>(null);
  const [composer, setComposer] = useState("");
  const [busy, setBusy] = useState<BusyMap>({});
  const [error, setError] = useState("");
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const setBusyKey = useCallback((key: string, value: boolean) => {
    setBusy((current) => {
      if (value) return { ...current, [key]: true };
      const next = { ...current };
      delete next[key];
      return next;
    });
  }, []);

  const applyData = useCallback((data: SolApiResponse) => {
    if (data.snapshot) setSnapshot(data.snapshot);
    if (data.team) setTeam(data.team);
    if (data.thread !== undefined) setThread(data.thread ?? null);
    if (data.error) setError(data.error);
  }, []);

  const refresh = useCallback(async (manual = false) => {
    if (manual) setBusyKey("refresh", true);
    try {
      const data = await fetchJson(`/api/admin/sol?agent=1&pathname=${encodeURIComponent(pathname)}`, undefined, 35_000);
      applyData(data);
      setError("");
    } catch (reason) {
      if (manual) setError(reason instanceof Error ? reason.message : "Sol could not refresh.");
    } finally {
      if (manual) setBusyKey("refresh", false);
    }
  }, [applyData, pathname, setBusyKey]);

  useEffect(() => {
    setOpen(window.localStorage.getItem("apostolic-guide-sol-open") === "1");
    void refresh(false);
  }, [refresh]);
  useEffect(() => { window.localStorage.setItem("apostolic-guide-sol-open", open ? "1" : "0"); }, [open]);
  useEffect(() => { if (open) void refresh(false); }, [open, pathname, refresh]);

  const liveRuns = currentRuns(snapshot?.runs ?? []);
  const activeCount = liveRuns.filter(isActiveRun).length;
  const attentionCount = liveRuns.filter(isAttentionRun).length;
  useEffect(() => {
    if (!open) return;
    const interval = window.setInterval(() => void refresh(false), activeCount ? 3500 : attentionCount ? 7000 : 12_000);
    return () => window.clearInterval(interval);
  }, [activeCount, attentionCount, open, refresh]);

  useEffect(() => {
    if (open && tab === "brief") chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [busy.chat, open, tab, thread?.messages.length]);

  const post = useCallback(async (key: string, body: Record<string, unknown>, timeoutMs = 105_000) => {
    setBusyKey(key, true);
    setError("");
    try {
      const data = await fetchJson("/api/admin/sol", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, timeoutMs);
      applyData(data);
      window.setTimeout(() => void refresh(false), 350);
      return data;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sol could not complete that action.");
      return null;
    } finally {
      setBusyKey(key, false);
    }
  }, [applyData, refresh, setBusyKey]);

  async function setMode(mode: SolMode, enabled = true) {
    if (!snapshot || !canOperate) return;
    await post("mode", { action: "update_settings", enabled, mode, weeklyTargets: snapshot.settings.weeklyTargets }, 30_000);
  }

  async function managerCycle() {
    await post("cycle", { action: "scan" }, 120_000);
  }

  async function runProposal(proposal: SolProposal) {
    await post(`run:${proposal.id}`, { action: "approve", proposalId: proposal.id, constraints: proposal.suggestedConstraints }, 45_000);
    setTab("activity");
  }

  async function dismissProposal(proposal: SolProposal) {
    await post(`dismiss:${proposal.id}`, { action: "dismiss", proposalId: proposal.id }, 30_000);
  }

  async function approvalDecision(approval: AgentApproval, decision: "approved" | "rejected") {
    await post(`approval:${approval.id}`, { action: "agent_approval", approvalId: approval.id, decision, context: { pathname } }, 45_000);
  }

  async function cancelRun(run: SolRun) {
    await post(`cancel:${run.id}`, { action: "cancel_run", runId: run.id }, 30_000);
  }

  async function retryRun(run: SolRun) {
    await post(`retry:${run.id}`, { action: "retry_run", runId: run.id }, 45_000);
  }

  const sendMessage = useCallback(async (raw: string) => {
    const message = raw.trim();
    if (!message || busy.chat || !canOperate) return;
    const optimistic: AgentMessage = { id: `local-${Date.now()}`, role: "user", kind: "text", content: message, metadata: {}, createdAt: new Date().toISOString() };
    setThread((current) => current ? { ...current, messages: [...current.messages, optimistic] } : current);
    setComposer("");
    setTab("brief");
    await post("chat", { action: "chat", message, context: { pathname } }, 110_000);
  }, [busy.chat, canOperate, pathname, post]);

  function submit(event: FormEvent) {
    event.preventDefault();
    void sendMessage(composer);
  }

  const pending = snapshot?.proposals.filter((proposal) => proposal.status === "pending") ?? [];
  const approvals = thread?.approvals ?? [];
  const state = managerRobotState(snapshot, team, Boolean(busy.chat));
  const needs = (team?.priorities.length ?? 0) + approvals.length + attentionCount;

  return <div className={`sol-mgr-root${open ? " is-open" : ""}`}>
    {open ? <aside className="sol-mgr-panel" aria-label="Sol Apostolic Guide Manager">
      <header className="sol-mgr-header">
        <div className="sol-mgr-identity"><SolRobotAvatar state={state}/><div><span><strong>Sol</strong><b>AG Manager</b></span><small><i/> Intelligence live · {executionLabel(snapshot)}</small></div></div>
        <div className="sol-mgr-header-actions"><button type="button" onClick={() => void refresh(true)}>{busy.refresh ? <Loader2 className="is-spinning" size={15}/> : <RefreshCw size={15}/>}</button><button type="button" onClick={() => setOpen(false)}><Minimize2 size={16}/></button></div>
      </header>

      <div className="sol-mgr-modebar">
        <span className="sol-mgr-intelligence"><BrainCircuit size={12}/> {team?.agents.length ?? 6} agents watching</span>
        <div>{(["watch", "assist", "trusted"] as SolMode[]).map((mode) => <button type="button" key={mode} disabled={!snapshot || !canOperate || Boolean(busy.mode)} className={snapshot?.settings.enabled && snapshot.settings.mode === mode ? "is-active" : ""} onClick={() => void setMode(mode)}>{mode}</button>)}</div>
      </div>

      <nav className="sol-mgr-tabs">{TABS.map(({ key, label, icon: Icon }) => {
        const count = key === "agents" ? team?.agents.filter((agent) => agent.state === "attention" || agent.state === "blocked").length ?? 0 : key === "queue" ? pending.length : key === "activity" ? liveRuns.length : team?.priorities.length ?? 0;
        return <button type="button" key={key} className={tab === key ? "is-active" : ""} onClick={() => setTab(key)}><Icon size={13}/><span>{label}</span>{count ? <b>{count > 9 ? "9+" : count}</b> : null}</button>;
      })}</nav>

      {error ? <div className="sol-mgr-error"><CircleAlert size={13}/><span>{error}</span><button type="button" onClick={() => setError("")}>Dismiss</button></div> : null}

      <div className={`sol-mgr-body is-${tab}`}>
        {tab === "brief" ? <div className="sol-mgr-brief">
          <section className="sol-mgr-command">
            <div><span>LIVE MANAGER BRIEF</span><h2>{team?.priorities[0]?.label ?? "System is caught up"}</h2><p>{team?.priorities[0]?.detail ?? "No urgent manager priorities are currently detected."}</p></div>
            <button type="button" disabled={Boolean(busy.cycle) || !canOperate} onClick={() => void managerCycle()}>{busy.cycle ? <Loader2 className="is-spinning" size={13}/> : <Zap size={13}/>} Run manager cycle</button>
          </section>

          {!snapshot?.settings.enabled ? <section className="sol-mgr-paused"><BrainCircuit size={17}/><div><strong>Intelligence is awake. Execution is paused.</strong><span>The six agents keep reading current state. Turn on Trusted to let allowlisted internal staging jobs run automatically.</span></div><button type="button" disabled={!canOperate || Boolean(busy.mode)} onClick={() => void setMode("trusted")}>Start Trusted</button></section> : null}

          {team?.priorities.length ? <section className="sol-mgr-priorities"><div className="sol-mgr-section-title"><Sparkles size={13}/><strong>What matters now</strong><small>updated {timeAgo(team.generatedAt)} ago</small></div>{team.priorities.slice(0, 5).map((item, index) => <div className={`sol-mgr-priority is-${item.severity}`} key={`${item.label}-${index}`}><b>{index + 1}</b><div><strong>{item.label}</strong><span>{item.detail}</span></div></div>)}</section> : null}

          {approvals.length ? <section className="sol-mgr-approvals"><div className="sol-mgr-section-title"><ShieldCheck size={13}/><strong>Needs you</strong></div>{approvals.map((approval) => <ApprovalCard key={approval.id} approval={approval} busy={busy} onDecision={(item, decision) => void approvalDecision(item, decision)}/>)}</section> : null}

          <section className="sol-mgr-chat">
            <div className="sol-mgr-context"><span>{surface.section}</span><strong>{surface.label}</strong></div>
            <div className="sol-mgr-messages">
              {!thread?.messages.length ? <div className="sol-mgr-welcome"><SolRobotAvatar state={state}/><div><strong>Give me an outcome.</strong><p>I’ll coordinate the agents, inspect current evidence, stage safe work, and tell you only where you are actually needed.</p></div></div> : null}
              {thread?.messages.slice(-30).map((message) => <MessageRow key={message.id} message={message}/>)}
              {busy.chat ? <div className="sol-mgr-working"><SolRobotAvatar state="thinking" small/><div><strong>Sol is coordinating the team</strong><span>Reading live state and calling registered tools.</span></div></div> : null}
              <div ref={chatEndRef}/>
            </div>
          </section>
        </div> : null}

        {tab === "agents" ? <div className="sol-mgr-stack"><div className="sol-mgr-view-head"><div><span>SPECIALIST TEAM</span><h2>Six agents. One manager.</h2></div><small>deterministic intelligence</small></div>{team?.agents.map((agent) => <AgentCard key={agent.key} agent={agent}/>)}</div> : null}

        {tab === "queue" && snapshot ? <div className="sol-mgr-stack"><div className="sol-mgr-view-head"><div><span>CURRENT QUEUE</span><h2>Work that can actually move</h2></div><button type="button" disabled={Boolean(busy.cycle)} onClick={() => void managerCycle()}>{busy.cycle ? <Loader2 className="is-spinning" size={12}/> : <RefreshCw size={12}/>} Reconcile</button></div>{!pending.length ? <div className="sol-mgr-empty"><ShieldCheck size={22}/><strong>No current proposals.</strong><span>The manager cycle will surface new work when evidence changes.</span></div> : pending.map((proposal) => <ProposalCard key={proposal.id} proposal={proposal} snapshot={snapshot} busy={busy} onRun={(item) => void runProposal(item)} onDismiss={(item) => void dismissProposal(item)}/>)}</div> : null}

        {tab === "activity" ? <div className="sol-mgr-stack"><div className="sol-mgr-view-head"><div><span>CURRENT EXECUTION</span><h2>Only live work and real gates</h2></div><small>{team?.hiddenHistoricalRuns ? `${team.hiddenHistoricalRuns} history items hidden` : "history is quiet"}</small></div>{!liveRuns.length ? <div className="sol-mgr-empty"><Activity size={22}/><strong>No current execution.</strong><span>Old completed and duplicate history does not occupy this view.</span></div> : liveRuns.map((run) => <RunCard key={run.id} run={run} busy={busy} onCancel={(item) => void cancelRun(item)} onRetry={(item) => void retryRun(item)}/>)}</div> : null}
      </div>

      <footer className="sol-mgr-composer"><form onSubmit={submit}><MessageSquareText size={14}/><textarea rows={1} value={composer} disabled={!canOperate || Boolean(busy.chat)} onChange={(event) => setComposer(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); if (composer.trim()) void sendMessage(composer); } }} placeholder={busy.chat ? "Sol is coordinating…" : `Ask Sol to manage ${surface.label.toLowerCase()}…`}/><button type="submit" disabled={!composer.trim() || Boolean(busy.chat) || !canOperate}>{busy.chat ? <Loader2 className="is-spinning" size={14}/> : <Send size={14}/>}</button></form><div><span><Users size={11}/> manager + 6 specialists</span><span>{snapshot?.settings.enabled ? snapshot.settings.mode : "execution paused"}</span></div></footer>
    </aside> : null}

    {!open ? <button type="button" className={`sol-mgr-launcher is-${state}`} onClick={() => { setOpen(true); setTab("brief"); }}><span><SolRobotAvatar state={state}/>{needs ? <b>{needs > 9 ? "9+" : needs}</b> : null}</span><span><strong>Sol Manager</strong><small><i/> {team?.agents.length ?? 6} agents live · {executionLabel(snapshot)}</small></span></button> : null}
  </div>;
}
