"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Bot,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Eye,
  Gauge,
  LoaderCircle,
  Play,
  RefreshCw,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  X
} from "lucide-react";
import { getSolAdminSurface } from "@/sol-admin-context";
import { SolRobotAvatar } from "@/sol-operator-client";
import type { SolMode } from "@/sol-operator-engine";
import type { SolOperatorSnapshot, SolProposal, SolRun } from "@/sol-operator";

const MODE_COPY: Record<SolMode, { label: string; short: string; detail: string }> = {
  watch: {
    label: "Watch",
    short: "Observe",
    detail: "Scans Studio, finds gaps, and reports what should happen next. Nothing runs."
  },
  assist: {
    label: "Assist",
    short: "Approve",
    detail: "Runs registered work only after you approve it. Every review and external-effect gate stays locked."
  },
  trusted: {
    label: "Trusted",
    short: "Safe autopilot",
    detail: "Auto-runs only allowlisted safe drafts after scans. Review-required work, publishing, activation, enrollment, and messaging still wait."
  }
};

const TABS = [
  { key: "today", label: "Today", icon: Sparkles },
  { key: "runs", label: "Runs", icon: Activity },
  { key: "kpis", label: "KPIs", icon: Gauge },
  { key: "settings", label: "Modes", icon: Settings2 }
] as const;

type TabKey = typeof TABS[number]["key"];
type ChatLine = { id: number; role: "sol" | "user"; text: string };

type SolApiResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
  snapshot?: SolOperatorSnapshot;
};

function timeAgo(value: string | null) {
  if (!value) return "never";
  const diff = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(diff) || diff < 0) return "just now";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function riskLabel(risk: SolProposal["risk"]) {
  if (risk === "safe_draft") return "Safe draft";
  if (risk === "external_effect") return "External effect";
  return "Review required";
}

function runStatusLabel(status: SolRun["status"]) {
  return status.replaceAll("_", " ");
}

function robotState(snapshot: SolOperatorSnapshot | null, busy: boolean) {
  if (busy) return "thinking" as const;
  if (!snapshot?.settings.enabled) return "off" as const;
  if (snapshot.runs.some((run) => run.status === "running" || run.status === "queued")) return "running" as const;
  if (snapshot.proposals.some((proposal) => proposal.status === "pending") || snapshot.runs.some((run) => run.status === "failed")) return "attention" as const;
  return "idle" as const;
}

function currentAttention(snapshot: SolOperatorSnapshot | null) {
  if (!snapshot) return "Loading Studio state…";
  if (!snapshot.dbReady) return "Sol storage is not ready.";
  const failed = snapshot.runs.filter((run) => run.status === "failed").length;
  const review = snapshot.runs.filter((run) => run.status === "waiting_review").length;
  const pending = snapshot.proposals.filter((proposal) => proposal.status === "pending").length;
  const active = snapshot.runs.filter((run) => run.status === "running" || run.status === "queued").length;
  if (failed) return `${failed} failed ${failed === 1 ? "run needs" : "runs need"} attention.`;
  if (review) return `${review} ${review === 1 ? "run is" : "runs are"} waiting for your review.`;
  if (active) return `${active} ${active === 1 ? "run is" : "runs are"} in progress.`;
  if (pending) return `${pending} work ${pending === 1 ? "proposal is" : "proposals are"} ready to review.`;
  return "No urgent operator work is waiting.";
}

function ProposalCard({ proposal, snapshot, canOperate, busy, onRun, onDismiss }: {
  proposal: SolProposal;
  snapshot: SolOperatorSnapshot;
  canOperate: boolean;
  busy: boolean;
  onRun: (proposal: SolProposal) => void;
  onDismiss: (proposal: SolProposal) => void;
}) {
  const runnable = canOperate && snapshot.settings.enabled && snapshot.settings.mode !== "watch" && !busy;
  return <article className={`sol-jarvis-proposal is-${proposal.priority}`}>
    <div className="sol-jarvis-proposal-top">
      <div>
        <span className={`sol-jarvis-risk is-${proposal.risk}`}>{proposal.priority} · {riskLabel(proposal.risk)}</span>
        <h3>{proposal.title}</h3>
      </div>
      <span className="sol-jarvis-recipe">{proposal.recipeKey.replaceAll("_", " ")}</span>
    </div>
    <p>{proposal.summary}</p>
    <div className="sol-jarvis-evidence">
      {proposal.evidence.slice(0, 3).map((item) => <div key={item.label} className={`is-${item.state ?? "info"}`}><strong>{item.value}</strong><span>{item.label}</span></div>)}
    </div>
    <details className="sol-jarvis-plan">
      <summary>Execution plan <ChevronRight size={14}/></summary>
      <ol>{proposal.plan.map((step) => <li key={step.key}><span>{step.label}</span>{step.gate ? <small>{step.gate}</small> : null}</li>)}</ol>
    </details>
    <div className="sol-jarvis-proposal-actions">
      <button type="button" className="sol-jarvis-secondary" disabled={!canOperate || busy} onClick={() => onDismiss(proposal)}>Dismiss</button>
      <button type="button" className="sol-jarvis-primary" disabled={!runnable} onClick={() => onRun(proposal)}><Play size={14}/>{snapshot.settings.mode === "watch" ? "Assist required" : proposal.risk === "safe_draft" && snapshot.settings.mode === "trusted" ? "Run safe draft" : "Run with gates"}</button>
    </div>
  </article>;
}

function RunCard({ run, busy, canOperate, onCancel }: { run: SolRun; busy: boolean; canOperate: boolean; onCancel: (run: SolRun) => void }) {
  const href = typeof run.result.href === "string" ? run.result.href : null;
  const active = run.status === "queued" || run.status === "running";
  return <article className={`sol-jarvis-run is-${run.status}`}>
    <div className="sol-jarvis-run-head">
      <div><span>{run.recipeKey.replaceAll("_", " ")}</span><strong>{run.pathwaySlug ?? "Workspace run"}</strong></div>
      <span className="sol-jarvis-run-status">{runStatusLabel(run.status)}</span>
    </div>
    <div className="sol-jarvis-progress"><i style={{ width: `${Math.max(0, Math.min(100, run.progress))}%` }}/></div>
    <div className="sol-jarvis-run-meta"><span>{run.progress}%</span><span>{run.currentStep?.replaceAll("_", " ") ?? "complete"}</span></div>
    {run.error ? <p className="sol-jarvis-run-error"><CircleAlert size={14}/>{run.error}</p> : null}
    {(href || active) ? <div className="sol-jarvis-run-actions">
      {href ? <Link href={href}>Open result <ChevronRight size={14}/></Link> : null}
      {active ? <button type="button" disabled={busy || !canOperate} onClick={() => onCancel(run)}>Cancel</button> : null}
    </div> : null}
  </article>;
}

export function SolAdminJarvis({ canOperate }: { canOperate: boolean }) {
  const pathname = usePathname();
  const surface = useMemo(() => getSolAdminSurface(pathname || "/admin"), [pathname]);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabKey>("today");
  const [snapshot, setSnapshot] = useState<SolOperatorSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatLine[]>([
    { id: 1, role: "sol", text: "I can see where you are in Studio. I can scan, reason over the workspace, and run registered recipes. I do not click the UI or bypass gates." }
  ]);
  const inputRef = useRef<HTMLInputElement>(null);
  const idRef = useRef(2);

  const refresh = useCallback(async (quiet = false) => {
    try {
      const response = await fetch("/api/admin/sol", { cache: "no-store" });
      if (!response.ok) throw new Error(`Sol status failed (${response.status}).`);
      const data = await response.json() as SolOperatorSnapshot;
      setSnapshot(data);
      if (!quiet) setError(null);
    } catch (cause) {
      if (!quiet) setError(cause instanceof Error ? cause.message : "Unable to load Sol.");
    }
  }, []);

  useEffect(() => { void refresh(true); }, [refresh]);
  useEffect(() => {
    const interval = window.setInterval(() => { void refresh(true); }, open ? 20_000 : 90_000);
    return () => window.clearInterval(interval);
  }, [open, refresh]);
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 80);
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    const mobile = window.matchMedia("(max-width: 640px)").matches;
    const previous = document.body.style.overflow;
    if (mobile) document.body.style.overflow = "hidden";
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
      if (mobile) document.body.style.overflow = previous;
    };
  }, [open]);

  const addChat = useCallback((role: ChatLine["role"], text: string) => {
    setChat((current) => [...current.slice(-7), { id: idRef.current++, role, text }]);
  }, []);

  const post = useCallback(async (body: Record<string, unknown>, fallbackMessage?: string) => {
    if (busy) return null;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/sol", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await response.json().catch(() => ({})) as SolApiResponse;
      if (!response.ok) throw new Error(data.error || `Sol request failed (${response.status}).`);
      if (data.snapshot) setSnapshot(data.snapshot);
      if (data.message || fallbackMessage) addChat("sol", data.message || fallbackMessage || "Done.");
      return data;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Sol request failed.";
      setError(message);
      addChat("sol", message);
      return null;
    } finally {
      setBusy(false);
    }
  }, [addChat, busy]);

  const sendMessage = useCallback(async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;
    setInput("");
    addChat("user", message);
    await post({ action: "chat", message, context: { pathname: surface.pathname } });
  }, [addChat, busy, post, surface.pathname]);

  const submitChat = (event: FormEvent) => {
    event.preventDefault();
    void sendMessage(input);
  };

  const changeMode = (mode: SolMode) => {
    if (!snapshot || !canOperate) return;
    void post({ action: "update_settings", enabled: true, mode, weeklyTargets: snapshot.settings.weeklyTargets }, `Sol is now in ${MODE_COPY[mode].label} mode.`);
  };

  const toggleEnabled = () => {
    if (!snapshot || !canOperate) return;
    const enabled = !snapshot.settings.enabled;
    void post({ action: "update_settings", enabled, mode: snapshot.settings.mode, weeklyTargets: snapshot.settings.weeklyTargets }, enabled ? "Sol is on." : "Sol is off.");
  };

  const runProposal = (proposal: SolProposal) => {
    void post({ action: "approve", proposalId: proposal.id, constraints: proposal.suggestedConstraints }, `Started ${proposal.title}.`);
  };

  const pending = snapshot?.proposals.filter((proposal) => proposal.status === "pending") ?? [];
  const activeRuns = snapshot?.runs.filter((run) => run.status === "queued" || run.status === "running").length ?? 0;
  const waitingRuns = snapshot?.runs.filter((run) => run.status === "waiting_review").length ?? 0;
  const mode = snapshot?.settings.mode ?? "watch";
  const state = robotState(snapshot, busy);

  return <div className={`sol-jarvis-root${open ? " is-open" : ""}`} data-mode={mode}>
    {open ? <button type="button" className="sol-jarvis-backdrop" aria-label="Close Sol" onClick={() => setOpen(false)}/> : null}

    {open ? <aside className="sol-jarvis-panel" role="dialog" aria-modal="false" aria-label="Sol admin operator">
      <header className="sol-jarvis-head">
        <div className="sol-jarvis-identity">
          <SolRobotAvatar state={state}/>
          <div><strong>Sol</strong><span>Admin Operator · Phase 2</span></div>
        </div>
        <div className="sol-jarvis-head-actions">
          {snapshot ? <button type="button" className={`sol-jarvis-power${snapshot.settings.enabled ? " is-on" : ""}`} onClick={toggleEnabled} disabled={!canOperate || busy} aria-pressed={snapshot.settings.enabled}><i/>{snapshot.settings.enabled ? "ON" : "OFF"}</button> : null}
          <button type="button" className="sol-jarvis-icon-button" onClick={() => setOpen(false)} aria-label="Close Sol"><X size={18}/></button>
        </div>
      </header>

      <section className="sol-jarvis-statusbar">
        <span className={`sol-jarvis-mode is-${mode}`}><i/>{MODE_COPY[mode].label}</span>
        <span><strong>{pending.length}</strong> proposed</span>
        <span><strong>{activeRuns}</strong> running</span>
        <span><strong>{waitingRuns}</strong> review</span>
        <span className="sol-jarvis-scan-age">scan {timeAgo(snapshot?.settings.lastScanAt ?? null)}</span>
      </section>

      <nav className="sol-jarvis-tabs" aria-label="Sol views">
        {TABS.map(({ key, label, icon: Icon }) => <button type="button" key={key} className={tab === key ? "is-active" : ""} onClick={() => setTab(key)}><Icon size={14}/><span>{label}</span>{key === "today" && pending.length ? <b>{pending.length}</b> : null}</button>)}
      </nav>

      <div className="sol-jarvis-scroll">
        {error ? <div className="sol-jarvis-alert"><CircleAlert size={15}/><span>{error}</span></div> : null}
        {!snapshot ? <div className="sol-jarvis-loading"><LoaderCircle size={20}/><span>Reading Studio…</span></div> : null}

        {snapshot && tab === "today" ? <div className="sol-jarvis-stack">
          <section className="sol-jarvis-surface-card">
            <div className="sol-jarvis-surface-top"><span>{surface.section}</span><strong>{surface.label}</strong></div>
            <p>{currentAttention(snapshot)}</p>
            <div className="sol-jarvis-quick-prompts">
              {surface.quickPrompts.slice(0, 3).map((prompt) => <button type="button" key={prompt} disabled={busy} onClick={() => void sendMessage(prompt)}>{prompt}</button>)}
            </div>
          </section>

          <section className="sol-jarvis-briefing">
            <div><span className="sol-jarvis-section-label">Operator brief</span><h2>What Sol recommends next</h2></div>
            <button type="button" className="sol-jarvis-scan-button" onClick={() => void post({ action: "scan" })} disabled={busy || !canOperate}><RefreshCw size={14} className={busy ? "is-spinning" : ""}/>Scan now</button>
          </section>

          {pending.length ? <div className="sol-jarvis-proposal-list">{pending.map((proposal) => <ProposalCard key={proposal.id} proposal={proposal} snapshot={snapshot} canOperate={canOperate} busy={busy} onRun={runProposal} onDismiss={(item) => void post({ action: "dismiss", proposalId: item.id }, `Dismissed ${item.title}.`)}/>)}</div> : <div className="sol-jarvis-empty"><CheckCircle2 size={22}/><strong>Queue is clear</strong><span>Run a scan when you want Sol to inspect the latest Studio state.</span></div>}
        </div> : null}

        {snapshot && tab === "runs" ? <div className="sol-jarvis-stack">
          <div className="sol-jarvis-section-intro"><span className="sol-jarvis-section-label">Execution</span><h2>Recent runs</h2><p>Every run is typed, tracked, and stopped at its registered gate.</p></div>
          {snapshot.runs.length ? <div className="sol-jarvis-run-list">{snapshot.runs.slice(0, 20).map((run) => <RunCard key={run.id} run={run} busy={busy} canOperate={canOperate} onCancel={(item) => void post({ action: "cancel_run", runId: item.id }, "Run cancelled.")}/>)}</div> : <div className="sol-jarvis-empty"><Activity size={22}/><strong>No runs yet</strong><span>Approved work will appear here with progress and review state.</span></div>}
        </div> : null}

        {snapshot && tab === "kpis" ? <div className="sol-jarvis-stack">
          <div className="sol-jarvis-section-intro"><span className="sol-jarvis-section-label">Production pace</span><h2>This week</h2><p>Sol uses these targets to tell the difference between busy work and missing output.</p></div>
          <div className="sol-jarvis-kpis">{snapshot.kpis.map((item) => {
            const percentage = item.target > 0 ? Math.min(100, Math.round((item.actual / item.target) * 100)) : 100;
            return <article key={item.key}><div><strong>{item.label}</strong><span>{item.actual} / {item.target}</span></div><div className="sol-jarvis-kpi-track"><i style={{ width: `${percentage}%` }}/></div><small>{item.actual >= item.target ? "On target" : `${item.target - item.actual} remaining`}</small></article>;
          })}</div>
          <div className="sol-jarvis-coverage">
            <div><strong>{snapshot.coverage.pathways}</strong><span>Pathways</span></div>
            <div><strong>{snapshot.coverage.audioReady}</strong><span>Audio ready</span></div>
            <div><strong>{snapshot.coverage.youtubePublished}</strong><span>YouTube live</span></div>
            <div><strong>{snapshot.coverage.carouselPublished}</strong><span>Carousel live</span></div>
            <div><strong>{snapshot.coverage.automationsLinked}</strong><span>Automations linked</span></div>
          </div>
        </div> : null}

        {snapshot && tab === "settings" ? <div className="sol-jarvis-stack">
          <div className="sol-jarvis-section-intro"><span className="sol-jarvis-section-label">Operating mode</span><h2>Same three modes. More useful.</h2><p>Trusted gets real autonomy, but only inside the safe-draft lane.</p></div>
          <div className="sol-jarvis-mode-list">
            {(Object.keys(MODE_COPY) as SolMode[]).map((item) => <button type="button" key={item} className={mode === item ? "is-active" : ""} onClick={() => changeMode(item)} disabled={!canOperate || busy}><span className={`sol-jarvis-mode-icon is-${item}`}>{item === "watch" ? <Eye size={17}/> : item === "assist" ? <Play size={17}/> : <ShieldCheck size={17}/>}</span><div><strong>{MODE_COPY[item].label}<small>{MODE_COPY[item].short}</small></strong><p>{MODE_COPY[item].detail}</p></div>{mode === item ? <CheckCircle2 size={17}/> : null}</button>)}
          </div>
          <section className="sol-jarvis-hard-locks">
            <span className="sol-jarvis-section-label">Hard locks</span>
            <div><ShieldCheck size={16}/><span><strong>Live publishing</strong>Manual approval remains required.</span></div>
            <div><ShieldCheck size={16}/><span><strong>Automation activation</strong>Drafts may be created; activation stays manual.</span></div>
            <div><ShieldCheck size={16}/><span><strong>People actions</strong>No automatic enrollment, outbound messages, or destructive changes.</span></div>
            <div><Bot size={16}/><span><strong>No browser clicking</strong>Sol uses registered server recipes instead of brittle DOM automation.</span></div>
          </section>
          <div className="sol-jarvis-readiness">
            <div className={snapshot.dbReady ? "is-ready" : "is-off"}><i/>{snapshot.dbReady ? "Storage ready" : "Storage unavailable"}</div>
            <div className={snapshot.aiReady ? "is-ready" : "is-off"}><i/>{snapshot.aiReady ? "AI ready" : "AI fallback"}</div>
            <div className={snapshot.rendererReady ? "is-ready" : "is-off"}><i/>{snapshot.rendererReady ? "Renderer ready" : "Renderer unavailable"}</div>
          </div>
        </div> : null}
      </div>

      <footer className="sol-jarvis-chat">
        <div className="sol-jarvis-chat-log" aria-live="polite">
          {chat.slice(-3).map((line) => <p key={line.id} className={`is-${line.role}`}>{line.role === "sol" ? <SolRobotAvatar state={state} small/> : null}<span>{line.text}</span></p>)}
        </div>
        <form onSubmit={submitChat}>
          <input ref={inputRef} value={input} onChange={(event) => setInput(event.target.value)} placeholder={`Ask Sol about ${surface.label}…`} disabled={busy || !canOperate} aria-label="Ask Sol"/>
          <button type="submit" disabled={busy || !input.trim() || !canOperate} aria-label="Send to Sol">{busy ? <LoaderCircle size={16} className="is-spinning"/> : <Send size={16}/>}</button>
        </form>
        <small>{mode === "trusted" ? "Trusted can auto-run safe drafts only. Everything else keeps its gate." : mode === "assist" ? "Assist runs only what you approve." : "Watch reports. Nothing runs."}</small>
      </footer>
    </aside> : null}

    {!open ? <button type="button" className="sol-jarvis-launcher" onClick={() => setOpen(true)} aria-label="Open Sol admin operator" aria-expanded="false">
      <SolRobotAvatar state={state}/><span>Ask Sol</span>{pending.length ? <b>{pending.length}</b> : null}
    </button> : null}
  </div>;
}
