"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Bot,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  Gauge,
  Loader2,
  MessageSquareText,
  Minimize2,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Square,
  X,
  Zap
} from "lucide-react";
import { getSolAdminSurface, type SolAdminSurface } from "@/sol-admin-context";
import { SolRobotAvatar } from "@/sol-operator-client";
import type { SolMode } from "@/sol-operator-engine";
import type { SolOperatorSnapshot, SolProposal, SolRun } from "@/sol-operator";

const MODE_COPY: Record<SolMode, { label: string; detail: string }> = {
  watch: { label: "Watch", detail: "Reads, scans, and recommends. Nothing runs." },
  assist: { label: "Assist", detail: "Prepares work and waits for your approval before mutations." },
  trusted: { label: "Trusted", detail: "Auto-runs only allowlisted safe drafts. Review and external effects still stop." }
};

const TABS = [
  { key: "chat", label: "Sol", icon: MessageSquareText },
  { key: "work", label: "Work", icon: Sparkles },
  { key: "runs", label: "Runs", icon: Activity },
  { key: "system", label: "System", icon: Gauge }
] as const;

type TabKey = typeof TABS[number]["key"];
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
type SolApiResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
  snapshot?: SolOperatorSnapshot;
  thread?: AgentThread | null;
  surface?: SolAdminSurface;
  agent?: { turnId?: string; toolCount?: number };
};

type BusyMap = Record<string, boolean>;

function timeAgo(value: string | null | undefined) {
  if (!value) return "never";
  const parsed = new Date(value).getTime();
  if (!Number.isFinite(parsed)) return "unknown";
  const diff = Date.now() - parsed;
  if (diff < 0 || diff < 45_000) return "just now";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function runStatusLabel(status: SolRun["status"]) {
  return status.replaceAll("_", " ");
}

function riskLabel(risk: SolProposal["risk"] | AgentApproval["risk"]) {
  if (risk === "safe_draft") return "Safe draft";
  if (risk === "external_effect") return "External effect";
  return "Review required";
}

function toolLabel(name: string) {
  const labels: Record<string, string> = {
    get_workspace_status: "Reading Studio state",
    get_current_screen: "Reading current screen",
    scan_workspace: "Scanning workspace",
    list_proposals: "Checking proposed work",
    list_runs: "Checking active runs",
    set_mode: "Changing operating mode",
    run_proposal: "Preparing registered work",
    dismiss_proposal: "Updating proposal",
    cancel_run: "Stopping run",
    retry_run: "Recovering run"
  };
  return labels[name] || name.replaceAll("_", " ");
}

function activeRun(run: SolRun) {
  return ["queued", "running", "retrying"].includes(run.status);
}

function attentionRun(run: SolRun) {
  return run.status === "failed" || run.status === "stalled" || run.status === "waiting_review";
}

function robotState(snapshot: SolOperatorSnapshot | null, chatBusy: boolean, approvals: AgentApproval[]) {
  if (chatBusy) return "thinking" as const;
  if (!snapshot?.settings.enabled) return "off" as const;
  if (snapshot.runs.some(activeRun)) return "running" as const;
  if (approvals.length || snapshot.runs.some((run) => run.status === "failed" || run.status === "stalled") || snapshot.proposals.some((proposal) => proposal.status === "pending")) return "attention" as const;
  return "idle" as const;
}

function statusCopy(snapshot: SolOperatorSnapshot | null, chatBusy: boolean, approvals: AgentApproval[]) {
  if (chatBusy) return "Thinking through it";
  if (!snapshot?.settings.enabled) return "Off";
  const running = snapshot.runs.filter(activeRun).length;
  if (running) return `${running} ${running === 1 ? "job" : "jobs"} moving`;
  if (approvals.length) return `${approvals.length} need${approvals.length === 1 ? "s" : ""} you`;
  const problems = snapshot.runs.filter((run) => run.status === "failed" || run.status === "stalled").length;
  if (problems) return `${problems} need${problems === 1 ? "s" : ""} recovery`;
  return "Ready";
}

async function fetchJson(url: string, options?: RequestInit, timeoutMs = 90_000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal, cache: "no-store" });
    const data = await response.json().catch(() => ({})) as SolApiResponse;
    if (!response.ok) throw new Error(data.error || `Sol request failed (${response.status}).`);
    return data;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("Sol stopped waiting on that request. The UI was released and current work can be refreshed safely.");
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

function ProposalCard({ proposal, snapshot, busy, onRun, onDismiss }: {
  proposal: SolProposal;
  snapshot: SolOperatorSnapshot;
  busy: BusyMap;
  onRun: (proposal: SolProposal) => void;
  onDismiss: (proposal: SolProposal) => void;
}) {
  const disabled = !snapshot.settings.enabled || snapshot.settings.mode === "watch";
  return <article className={`sol-v3-proposal is-${proposal.priority}`}>
    <div className="sol-v3-proposal-head">
      <div><span className={`sol-v3-risk is-${proposal.risk}`}>{riskLabel(proposal.risk)}</span><h3>{proposal.title}</h3></div>
      <span className="sol-v3-recipe">{proposal.recipeKey.replaceAll("_", " ")}</span>
    </div>
    <p>{proposal.summary}</p>
    <div className="sol-v3-evidence">
      {proposal.evidence.slice(0, 3).map((item) => <span key={item.label} className={`is-${item.state ?? "info"}`}><strong>{item.value}</strong><small>{item.label}</small></span>)}
    </div>
    <details className="sol-v3-plan"><summary><ChevronRight size={12}/> See execution plan</summary><ol>{proposal.plan.map((step) => <li key={step.key}>{step.label}<small>{step.gate ?? "automatic"}</small></li>)}</ol></details>
    <div className="sol-v3-card-actions">
      <button type="button" className="sol-v3-secondary" disabled={Boolean(busy[`dismiss:${proposal.id}`])} onClick={() => onDismiss(proposal)}>{busy[`dismiss:${proposal.id}`] ? <Loader2 className="is-spinning" size={13}/> : <X size={13}/>} Dismiss</button>
      <button type="button" className="sol-v3-primary" disabled={disabled || Boolean(busy[`run:${proposal.id}`])} onClick={() => onRun(proposal)}>{busy[`run:${proposal.id}`] ? <Loader2 className="is-spinning" size={13}/> : <Play size={13}/>} {disabled ? "Watch only" : "Approve & run"}</button>
    </div>
  </article>;
}

function ApprovalCard({ approval, busy, onDecision }: { approval: AgentApproval; busy: BusyMap; onDecision: (approval: AgentApproval, decision: "approved" | "rejected") => void }) {
  const key = `approval:${approval.id}`;
  return <article className="sol-v3-approval">
    <div className="sol-v3-approval-icon"><ShieldCheck size={16}/></div>
    <div className="sol-v3-approval-copy"><span>{riskLabel(approval.risk)} · approval</span><strong>{approval.summary}</strong><small>{toolLabel(approval.toolName)}</small></div>
    <div className="sol-v3-approval-actions">
      <button type="button" disabled={Boolean(busy[key])} onClick={() => onDecision(approval, "rejected")}><X size={12}/> No</button>
      <button type="button" className="is-approve" disabled={Boolean(busy[key])} onClick={() => onDecision(approval, "approved")}>{busy[key] ? <Loader2 className="is-spinning" size={12}/> : <Check size={12}/>} Approve</button>
    </div>
  </article>;
}

function RunCard({ run, busy, onCancel, onRetry }: { run: SolRun; busy: BusyMap; onCancel: (run: SolRun) => void; onRetry: (run: SolRun) => void }) {
  const isActive = activeRun(run);
  const retryable = run.status === "failed" || run.status === "stalled" || run.status === "retrying";
  const href = typeof run.result.href === "string" ? run.result.href : null;
  const age = Date.now() - new Date(run.updatedAt).getTime();
  const quiet = run.status === "running" && Number.isFinite(age) && age > 4 * 60_000;
  return <article className={`sol-v3-run is-${run.status}${quiet ? " is-quiet" : ""}`}>
    <div className="sol-v3-run-head">
      <div><span>{run.pathwaySlug || "workspace"}</span><strong>{String(run.inputs.proposalTitle || run.recipeKey.replaceAll("_", " "))}</strong></div>
      <span className="sol-v3-run-status">{runStatusLabel(run.status)}</span>
    </div>
    <div className="sol-v3-progress"><i style={{ width: `${Math.max(2, run.progress)}%` }}/></div>
    <div className="sol-v3-run-meta"><span>{run.progress}%</span><span>{run.currentStep ? run.currentStep.replaceAll("_", " ") : "waiting"}</span><span>updated {timeAgo(run.updatedAt)}</span></div>
    {run.error ? <p className="sol-v3-run-error"><CircleAlert size={13}/>{run.error}</p> : null}
    {quiet ? <p className="sol-v3-run-warning"><Clock3 size={13}/>No progress signal for several minutes. The recovery worker will stop or recover this instead of leaving it spinning forever.</p> : null}
    <div className="sol-v3-run-actions">
      {isActive ? <button type="button" disabled={Boolean(busy[`cancel:${run.id}`])} onClick={() => onCancel(run)}><Square size={11}/> Cancel</button> : null}
      {retryable ? <button type="button" className="is-retry" disabled={Boolean(busy[`retry:${run.id}`])} onClick={() => onRetry(run)}>{busy[`retry:${run.id}`] ? <Loader2 className="is-spinning" size={11}/> : <RotateCcw size={11}/>} Retry</button> : null}
      {href ? <Link href={href}>Review <ChevronRight size={11}/></Link> : null}
    </div>
  </article>;
}

function MessageRow({ message }: { message: AgentMessage }) {
  if (message.role === "tool") {
    const toolName = typeof message.metadata.toolName === "string" ? message.metadata.toolName : message.content;
    const ok = message.metadata.ok !== false;
    return <div className={`sol-v3-tool-event is-${message.kind}${ok ? "" : " is-error"}`}>
      {message.kind === "tool_call" ? <Loader2 size={12}/> : ok ? <Check size={12}/> : <CircleAlert size={12}/>}<span>{message.kind === "tool_call" ? toolLabel(toolName) : message.content}</span><small>{timeAgo(message.createdAt)}</small>
    </div>;
  }
  if (message.kind === "approval") return null;
  if (message.role !== "user" && message.role !== "assistant") return null;
  return <div className={`sol-v3-message is-${message.role}`}>
    {message.role === "assistant" ? <SolRobotAvatar state="idle" small/> : null}
    <div><p>{message.content}</p><small>{timeAgo(message.createdAt)}</small></div>
  </div>;
}

export function SolAdminJarvis({ canOperate }: { canOperate: boolean }) {
  const pathname = usePathname() || "/admin";
  const surface = useMemo(() => getSolAdminSurface(pathname), [pathname]);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabKey>("chat");
  const [snapshot, setSnapshot] = useState<SolOperatorSnapshot | null>(null);
  const [thread, setThread] = useState<AgentThread | null>(null);
  const [composer, setComposer] = useState("");
  const [busy, setBusy] = useState<BusyMap>({});
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
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
    if (data.thread !== undefined) setThread(data.thread ?? null);
    if (data.error) setError(data.error);
  }, []);

  const refresh = useCallback(async (quiet = true) => {
    if (!quiet) setBusyKey("refresh", true);
    try {
      const data = await fetchJson(`/api/admin/sol?agent=1&pathname=${encodeURIComponent(pathname)}`, undefined, 30_000);
      applyData(data);
      setError("");
      setLoaded(true);
    } catch (reason) {
      if (!quiet) setError(reason instanceof Error ? reason.message : "Sol could not refresh.");
    } finally {
      if (!quiet) setBusyKey("refresh", false);
    }
  }, [applyData, pathname, setBusyKey]);

  useEffect(() => {
    const saved = window.localStorage.getItem("apostolic-guide-sol-open");
    if (saved === "1") setOpen(true);
    void refresh(true);
  }, [refresh]);

  useEffect(() => {
    window.localStorage.setItem("apostolic-guide-sol-open", open ? "1" : "0");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    void refresh(true);
  }, [open, pathname, refresh]);

  const hasActiveRuns = snapshot?.runs.some(activeRun) ?? false;
  const hasAttention = (thread?.approvals.length ?? 0) > 0 || (snapshot?.runs.some(attentionRun) ?? false);
  useEffect(() => {
    if (!open) return;
    const interval = window.setInterval(() => void refresh(true), hasActiveRuns ? 3500 : hasAttention ? 7000 : 15_000);
    return () => window.clearInterval(interval);
  }, [hasActiveRuns, hasAttention, open, refresh]);

  useEffect(() => {
    if (tab !== "chat" || !open) return;
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [thread?.messages.length, thread?.approvals.length, busy.chat, open, tab]);

  const post = useCallback(async (key: string, body: Record<string, unknown>, timeoutMs = 90_000) => {
    setBusyKey(key, true);
    setError("");
    try {
      const data = await fetchJson("/api/admin/sol", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, timeoutMs);
      applyData(data);
      return data;
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Sol could not complete that action.";
      setError(message);
      void refresh(true);
      return null;
    } finally {
      setBusyKey(key, false);
    }
  }, [applyData, refresh, setBusyKey]);

  const sendMessage = useCallback(async (raw: string) => {
    const text = raw.trim();
    if (!text || busy.chat || !canOperate) return;
    const optimistic: AgentMessage = { id: `local-${Date.now()}`, role: "user", kind: "text", content: text, metadata: {}, createdAt: new Date().toISOString() };
    setThread((current) => current ? { ...current, messages: [...current.messages, optimistic] } : current);
    setComposer("");
    setTab("chat");
    await post("chat", { action: "chat", message: text, context: { pathname } }, 105_000);
  }, [busy.chat, canOperate, pathname, post]);

  function submit(event: FormEvent) {
    event.preventDefault();
    void sendMessage(composer);
  }

  async function changeMode(mode: SolMode) {
    if (!snapshot || !canOperate) return;
    await post("mode", { action: "update_settings", enabled: true, mode, weeklyTargets: snapshot.settings.weeklyTargets }, 30_000);
  }

  async function togglePower() {
    if (!snapshot || !canOperate) return;
    await post("power", { action: "update_settings", enabled: !snapshot.settings.enabled, mode: snapshot.settings.mode, weeklyTargets: snapshot.settings.weeklyTargets }, 30_000);
  }

  async function runProposal(proposal: SolProposal) {
    await post(`run:${proposal.id}`, { action: "approve", proposalId: proposal.id, constraints: proposal.suggestedConstraints });
    setTab("runs");
  }

  async function dismissProposal(proposal: SolProposal) {
    await post(`dismiss:${proposal.id}`, { action: "dismiss", proposalId: proposal.id }, 30_000);
  }

  async function approvalDecision(approval: AgentApproval, decision: "approved" | "rejected") {
    await post(`approval:${approval.id}`, { action: "agent_approval", approvalId: approval.id, decision, context: { pathname } });
  }

  async function cancelRun(run: SolRun) {
    await post(`cancel:${run.id}`, { action: "cancel_run", runId: run.id }, 30_000);
  }

  async function retryRun(run: SolRun) {
    await post(`retry:${run.id}`, { action: "retry_run", runId: run.id }, 30_000);
  }

  const pending = snapshot?.proposals.filter((proposal) => proposal.status === "pending") ?? [];
  const runs = snapshot?.runs.slice(0, 24) ?? [];
  const approvals = thread?.approvals ?? [];
  const state = robotState(snapshot, Boolean(busy.chat), approvals);
  const needsBadge = approvals.length + runs.filter((run) => run.status === "failed" || run.status === "stalled" || run.status === "waiting_review").length + pending.length;

  return <div className={`sol-v3-root${open ? " is-open" : ""}`}>
    {open ? <aside className="sol-v3-panel" aria-label="Sol Studio agent">
      <header className="sol-v3-header">
        <div className="sol-v3-identity">
          <SolRobotAvatar state={state}/>
          <div><span className="sol-v3-name-row"><strong>Sol</strong><b className={`is-${state}`}>{statusCopy(snapshot, Boolean(busy.chat), approvals)}</b></span><small>Studio agent · persistent operator</small></div>
        </div>
        <div className="sol-v3-header-actions">
          <button type="button" className={`sol-v3-power${snapshot?.settings.enabled ? " is-on" : ""}`} disabled={!snapshot || !canOperate || Boolean(busy.power)} onClick={() => void togglePower()} aria-pressed={snapshot?.settings.enabled}>{busy.power ? <Loader2 className="is-spinning" size={12}/> : <Zap size={12}/>}<span>{snapshot?.settings.enabled ? "On" : "Off"}</span></button>
          <button type="button" className="sol-v3-icon" onClick={() => void refresh(false)} aria-label="Refresh Sol">{busy.refresh ? <Loader2 className="is-spinning" size={15}/> : <RefreshCw size={15}/>}</button>
          <button type="button" className="sol-v3-icon" onClick={() => setOpen(false)} aria-label="Minimize Sol"><Minimize2 size={16}/></button>
        </div>
      </header>

      <div className="sol-v3-modebar">
        {(["watch", "assist", "trusted"] as SolMode[]).map((mode) => <button type="button" key={mode} disabled={!snapshot || !canOperate || Boolean(busy.mode)} className={snapshot?.settings.mode === mode && snapshot.settings.enabled ? "is-active" : ""} onClick={() => void changeMode(mode)}><i/>{MODE_COPY[mode].label}</button>)}
        <span>scan {timeAgo(snapshot?.settings.lastScanAt)}</span>
      </div>

      <nav className="sol-v3-tabs" aria-label="Sol sections">
        {TABS.map(({ key, label, icon: Icon }) => {
          const count = key === "work" ? pending.length : key === "runs" ? runs.filter(attentionRun).length : key === "chat" ? approvals.length : 0;
          return <button type="button" key={key} className={tab === key ? "is-active" : ""} onClick={() => setTab(key)}><Icon size={13}/><span>{label}</span>{count ? <b>{count}</b> : null}</button>;
        })}
      </nav>

      {error ? <div className="sol-v3-error"><CircleAlert size={14}/><span>{error}</span><button type="button" onClick={() => setError("")}>Dismiss</button></div> : null}

      <div className={`sol-v3-body is-${tab}`}>
        {!loaded && !snapshot ? <div className="sol-v3-loading"><SolRobotAvatar state="thinking"/><Loader2 className="is-spinning" size={16}/><span>Reading Studio state…</span></div> : null}

        {tab === "chat" && snapshot ? <div className="sol-v3-chat-view">
          <div className="sol-v3-context-card">
            <div><span>{surface.section}</span><strong>{surface.label}</strong>{surface.entityId ? <small>{surface.entityId}</small> : null}</div>
            <button type="button" disabled={Boolean(busy.scan)} onClick={() => void post("scan", { action: "scan" })}>{busy.scan ? <Loader2 className="is-spinning" size={12}/> : <RefreshCw size={12}/>} Scan</button>
          </div>

          {approvals.length ? <section className="sol-v3-approval-stack"><div className="sol-v3-section-title"><ShieldCheck size={13}/><strong>Needs your approval</strong></div>{approvals.map((approval) => <ApprovalCard key={approval.id} approval={approval} busy={busy} onDecision={(item, decision) => void approvalDecision(item, decision)}/>)}</section> : null}

          <div className="sol-v3-messages">
            {!thread?.messages.length ? <div className="sol-v3-welcome"><SolRobotAvatar state={state}/><strong>I’m on this screen with you.</strong><p>Tell me the outcome you want. I’ll inspect Studio, use the tools I actually have, and stop only when I hit a real approval or review gate.</p></div> : null}
            {thread?.messages.slice(-60).map((message) => <MessageRow key={message.id} message={message}/>)}
            {busy.chat ? <div className="sol-v3-thinking"><SolRobotAvatar state="thinking" small/><div><strong>Working the problem</strong><span>I can call several tools in this turn. You can still use Work and Runs while I do.</span></div></div> : null}
            <div ref={chatEndRef}/>
          </div>

          <div className="sol-v3-quick-prompts">
            {surface.quickPrompts.slice(0, 3).map((prompt) => <button type="button" key={prompt} disabled={Boolean(busy.chat) || !canOperate} onClick={() => void sendMessage(prompt)}>{prompt}</button>)}
          </div>
        </div> : null}

        {tab === "work" && snapshot ? <div className="sol-v3-stack">
          <div className="sol-v3-section-head"><div><span>Operator queue</span><h2>What should move next</h2></div><button type="button" disabled={Boolean(busy.scan)} onClick={() => void post("scan", { action: "scan" })}>{busy.scan ? <Loader2 className="is-spinning" size={13}/> : <RefreshCw size={13}/>} Scan now</button></div>
          {!pending.length ? <div className="sol-v3-empty"><ShieldCheck size={23}/><strong>No work is waiting.</strong><span>{snapshot.settings.lastScanAt ? "The last scan found no new registered work." : "Run a scan and Sol will build evidence-backed proposals."}</span></div> : pending.map((proposal) => <ProposalCard key={proposal.id} proposal={proposal} snapshot={snapshot} busy={busy} onRun={(item) => void runProposal(item)} onDismiss={(item) => void dismissProposal(item)}/>)}
        </div> : null}

        {tab === "runs" && snapshot ? <div className="sol-v3-stack">
          <div className="sol-v3-section-head"><div><span>Durable execution</span><h2>Runs do not disappear into a spinner</h2></div><button type="button" onClick={() => void refresh(false)}>{busy.refresh ? <Loader2 className="is-spinning" size={13}/> : <RefreshCw size={13}/>} Refresh</button></div>
          {!runs.length ? <div className="sol-v3-empty"><Activity size={23}/><strong>No runs yet.</strong><span>Approved work will show progress, review stops, failures, and recovery here.</span></div> : <div className="sol-v3-run-list">{runs.map((run) => <RunCard key={run.id} run={run} busy={busy} onCancel={(item) => void cancelRun(item)} onRetry={(item) => void retryRun(item)}/>)}</div>}
        </div> : null}

        {tab === "system" && snapshot ? <div className="sol-v3-stack">
          <section className="sol-v3-system-card">
            <div className="sol-v3-section-title"><Bot size={13}/><strong>Operating mode</strong></div>
            <div className="sol-v3-mode-cards">{(["watch", "assist", "trusted"] as SolMode[]).map((mode) => <button type="button" key={mode} disabled={!canOperate || Boolean(busy.mode)} className={snapshot.settings.enabled && snapshot.settings.mode === mode ? "is-active" : ""} onClick={() => void changeMode(mode)}><span><i/>{MODE_COPY[mode].label}</span><small>{MODE_COPY[mode].detail}</small></button>)}</div>
          </section>

          <section className="sol-v3-system-card">
            <div className="sol-v3-section-title"><Gauge size={13}/><strong>This week</strong></div>
            <div className="sol-v3-kpis">{snapshot.kpis.map((kpi) => { const pct = kpi.target ? Math.min(100, Math.round((kpi.actual / kpi.target) * 100)) : 100; return <div key={kpi.key}><span><strong>{kpi.label}</strong><b>{kpi.actual}<small> / {kpi.target}</small></b></span><i><b style={{ width: `${pct}%` }}/></i></div>; })}</div>
          </section>

          <section className="sol-v3-system-card">
            <div className="sol-v3-section-title"><ShieldCheck size={13}/><strong>Hard boundaries</strong></div>
            <div className="sol-v3-locks"><span><Check size={12}/> Live publishing stays gated</span><span><Check size={12}/> Automation activation stays gated</span><span><Check size={12}/> No outbound messaging or enrollment</span><span><Check size={12}/> No canonical Pathway doctrine edits</span><span><Check size={12}/> Tool evidence required before “done”</span></div>
          </section>

          <section className="sol-v3-system-card">
            <div className="sol-v3-section-title"><Activity size={13}/><strong>Coverage</strong></div>
            <div className="sol-v3-coverage"><span><b>{snapshot.coverage.pathways}</b>Pathways</span><span><b>{snapshot.coverage.audioReady}</b>Audio ready</span><span><b>{snapshot.coverage.youtubePublished}</b>YouTube</span><span><b>{snapshot.coverage.carouselPublished}</b>Carousels</span><span><b>{snapshot.coverage.automationsLinked}</b>Automations</span></div>
          </section>
        </div> : null}
      </div>

      <footer className="sol-v3-composer">
        <form onSubmit={submit}>
          <MessageSquareText size={15}/>
          <textarea rows={1} value={composer} disabled={!canOperate || Boolean(busy.chat)} onChange={(event) => setComposer(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); if (composer.trim()) void sendMessage(composer); } }} placeholder={!canOperate ? "Read-only access" : busy.chat ? "Sol is working this turn…" : `Ask Sol about ${surface.label.toLowerCase()}…`}/>
          <button type="submit" disabled={!composer.trim() || Boolean(busy.chat) || !canOperate} aria-label="Send to Sol">{busy.chat ? <Loader2 className="is-spinning" size={15}/> : <Send size={15}/>}</button>
        </form>
        <div><span>{snapshot?.settings.enabled ? `${MODE_COPY[snapshot.settings.mode].label} mode` : "Sol off"}</span><span>tool loop · durable memory · recovery worker</span></div>
      </footer>
    </aside> : null}

    {!open ? <button type="button" className={`sol-v3-launcher is-${state}`} onClick={() => { setOpen(true); setTab("chat"); }} aria-label="Open Sol Studio agent">
      <span className="sol-v3-launcher-robot"><SolRobotAvatar state={state}/>{needsBadge ? <b>{needsBadge > 9 ? "9+" : needsBadge}</b> : null}</span>
      <span><strong>Ask Sol</strong><small>{statusCopy(snapshot, Boolean(busy.chat), approvals)}</small></span>
    </button> : null}
  </div>;
}
