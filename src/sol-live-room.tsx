"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, Bot, Octagon, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";
import { solLiveAttentionCount, solLivePayloadFromApi, type SolLivePayload, type SolLiveRun } from "@/sol-live-room-model";

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function timeLabel(value: string | null) {
  if (!value) return "not yet";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "unknown";
  const minutes = Math.max(0, Math.floor((Date.now() - parsed) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function activeRun(run: SolLiveRun) {
  return ["queued", "running", "retrying"].includes(run.status);
}

export function SolLiveRoom({ initial, canStop }: { initial: SolLivePayload; canStop: boolean }) {
  const [payload, setPayload] = useState(initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"refresh" | "stop" | null>(null);
  const [freshKeys, setFreshKeys] = useState<string[]>([]);
  const seenKeys = useRef(new Set<string>());
  const priorityList = useRef<HTMLDivElement | null>(null);
  const priorityPositions = useRef(new Map<string, number>());
  const activeCount = payload.runs.filter(activeRun).length;
  const attention = solLiveAttentionCount(payload);
  const pending = payload.proposals.filter((proposal) => proposal.status === "pending");
  const behind = payload.kpis.filter((kpi) => kpi.actual < kpi.target);
  const activity = useMemo(() => {
    const rows = payload.recentActivity.length ? payload.recentActivity : payload.runs;
    return [...rows].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)).slice(0, 8);
  }, [payload.recentActivity, payload.runs]);
  const liveSummary = `${payload.agents.filter((agent) => agent.state === "working").length} agents working, ${attention.review} waiting review, ${attention.failed} failed.`;

  const refresh = useCallback(async (manual = false) => {
    if (manual) setBusy("refresh");
    try {
      const response = await fetch("/api/admin/sol", { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : "Sol could not refresh.");
      const next = solLivePayloadFromApi(data);
      if (!next) throw new Error("Sol returned an unreadable snapshot.");
      setPayload(next);
      setError("");
    } catch (reason) {
      if (manual) setError(reason instanceof Error ? reason.message : "Sol could not refresh.");
    } finally {
      if (manual) setBusy(null);
    }
  }, []);

  async function stopSol() {
    if (!canStop || busy) return;
    const confirmed = window.confirm("Stop Sol? Queued work and pending approvals will be cancelled. Intelligence stays readable.");
    if (!confirmed) return;
    setBusy("stop");
    setError("");
    try {
      const response = await fetch("/api/admin/sol", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "stop", confirm: true })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : "Sol could not be stopped.");
      const next = solLivePayloadFromApi(data);
      if (next) setPayload(next);
      else await refresh(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sol could not be stopped.");
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    const keys = [
      ...payload.runs.map((run) => `run:${run.id}`),
      ...payload.priorities.map((item) => `priority:${item.label}`),
      ...activity.map((item) => `activity:${item.id}:${item.status}`)
    ];
    const entered = keys.filter((key) => !seenKeys.current.has(key));
    keys.forEach((key) => seenKeys.current.add(key));
    if (!entered.length || prefersReducedMotion()) return;
    setFreshKeys(entered);
    const timer = window.setTimeout(() => setFreshKeys([]), 700);
    return () => window.clearTimeout(timer);
  }, [activity, payload.priorities, payload.runs]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh(false);
    }, activeCount ? 4000 : 10000);
    return () => window.clearInterval(interval);
  }, [activeCount, refresh]);

  useEffect(() => {
    const nodes = priorityList.current?.querySelectorAll<HTMLElement>("[data-live-key]") ?? [];
    const reduced = prefersReducedMotion();
    nodes.forEach((node) => {
      const key = node.dataset.liveKey;
      if (!key) return;
      const next = node.getBoundingClientRect().top;
      const previous = priorityPositions.current.get(key);
      if (previous != null && Math.abs(previous - next) > 1 && !reduced) {
        node.animate(
          [{ transform: `translateY(${previous - next}px)` }, { transform: "translateY(0)" }],
          { duration: 320, easing: "ease" }
        );
      }
      priorityPositions.current.set(key, next);
    });
  }, [payload.priorities]);

  const modeLabel = payload.settings.enabled ? payload.settings.mode : "paused";

  return <div className="sol-live-page">
    <p className="sol-live-sr" aria-live="polite">{liveSummary}</p>
    <section className={`sol-live-hero is-${modeLabel}`}>
      <div>
        <span>NOW</span>
        <h2>{payload.settings.enabled ? `Sol is in ${payload.settings.mode} mode.` : "Execution is paused. Intelligence is still readable."}</h2>
        <p>{activeCount ? `${activeCount} job${activeCount === 1 ? "" : "s"} moving.` : "No job is running."} Updated {timeLabel(payload.generatedAt)}. Last scan {timeLabel(payload.settings.lastScanAt)}.</p>
      </div>
      <div className="sol-live-hero-actions">
        <strong className={`sol-live-mode is-${modeLabel}`}>{modeLabel}</strong>
        <button type="button" onClick={() => void refresh(true)} disabled={busy !== null}>{busy === "refresh" ? <RefreshCw size={14} className="is-spin"/> : <RefreshCw size={14}/>} Refresh</button>
        {canStop ? <button type="button" className="is-stop" onClick={() => void stopSol()} disabled={busy !== null}><Octagon size={14}/> {busy === "stop" ? "Stopping" : "Stop Sol"}</button> : <span>Stop Sol is limited to Owner and Admin.</span>}
      </div>
    </section>
    {error ? <p className="sol-live-error" role="alert">{error}</p> : null}
    {!payload.dbReady ? <p className="sol-live-note">Sol storage is not ready, so this room is showing the last safe empty state.</p> : null}

    <section className="sol-live-metrics" aria-label="Current operating pressure">
      <article><Bot size={16}/><div><strong>{payload.agents.filter((agent) => agent.state === "working").length}</strong><span>Working</span></div></article>
      <article><Activity size={16}/><div><strong>{activeCount}</strong><span>Moving jobs</span></div></article>
      <article className={attention.review ? "is-warn" : ""}><ShieldCheck size={16}/><div><strong>{attention.review}</strong><span>Waiting review</span></div></article>
      <article className={attention.failed ? "is-warn" : ""}><TriangleAlert size={16}/><div><strong>{attention.failed}</strong><span>Failed or stalled</span></div></article>
      <article className={behind.length ? "is-warn" : ""}><div><strong>{behind.length}</strong><span>KPIs behind</span></div></article>
    </section>

    <div className="sol-live-grid">
      <section className="sol-live-card">
        <header><span>Workers</span><h3>Specialist state</h3></header>
        <div className="sol-live-stack">
          {payload.agents.length ? payload.agents.map((agent) => <article key={agent.key} className={`sol-live-agent is-${agent.state}`}><div><b className="sol-live-dot"/> <strong>{agent.name}</strong><small>{agent.role}</small></div><em>{agent.state}</em><p>{agent.nextAction}</p></article>) : <p className="sol-live-empty">Specialist states appear after the next refresh.</p>}
        </div>
      </section>

      <section className="sol-live-card">
        <header><span>Next</span><h3>What should move</h3></header>
        <div className="sol-live-stack" ref={priorityList}>
          {payload.priorities.length ? payload.priorities.map((item, index) => {
            const key = `priority:${item.label}`;
            return <article data-live-key={key} className={`sol-live-priority is-${item.severity}${freshKeys.includes(key) ? " is-enter" : ""}`} key={key}><b>{index + 1}</b><div><strong>{item.label}</strong><span>{item.detail}</span></div></article>;
          }) : <p className="sol-live-empty">No ranked priority is waiting.</p>}
        </div>
      </section>

      <section className="sol-live-card">
        <header><span>Queue</span><h3>Current jobs</h3></header>
        <div className="sol-live-stack">
          {payload.runs.length ? payload.runs.map((run) => {
            const key = `run:${run.id}`;
            return <article key={run.id} className={`sol-live-run is-${run.status}${freshKeys.includes(key) ? " is-enter" : ""}`}>
              <div><strong>{run.recipeKey.replaceAll("_", " ")}</strong><small>{run.pathwaySlug || "workspace"}</small><em>{run.status.replaceAll("_", " ")}</em></div>
              <div className={`sol-live-progress${activeRun(run) ? " is-active" : ""}`} aria-hidden="true"><i style={{ width: `${Math.max(2, Math.min(100, run.progress))}%` }}/></div>
              <p>{run.currentStep?.replaceAll("_", " ") || "waiting"} · {run.progress}%</p>
              {run.error ? <p className="sol-live-run-error">{run.error}</p> : null}
            </article>;
          }) : <p className="sol-live-empty">No current job is queued, running, or waiting.</p>}
        </div>
      </section>

      <section className="sol-live-card">
        <header><span>Approvals</span><h3>Proposals waiting</h3></header>
        <div className="sol-live-stack">
          {pending.length ? pending.slice(0, 6).map((proposal) => <article key={proposal.id} className={`sol-live-proposal is-${proposal.priority}`}><div><strong>{proposal.title}</strong><em>{proposal.risk.replaceAll("_", " ")}</em></div><p>{proposal.summary}</p><small>{proposal.pathwaySlugs.join(", ") || "workspace"}</small></article>) : <p className="sol-live-empty">No proposal is waiting for a decision.</p>}
        </div>
      </section>

      <section className="sol-live-card sol-live-card-wide">
        <header><span>Activity</span><h3>Recent work</h3></header>
        <div className="sol-live-activity">
          {activity.length ? activity.map((item) => {
            const key = `activity:${item.id}:${item.status}`;
            return <article key={key} className={freshKeys.includes(key) ? "is-enter" : ""}><b>{item.status.replaceAll("_", " ")}</b><span>{item.recipeKey.replaceAll("_", " ")}</span><small>{item.pathwaySlug || "workspace"} · {timeLabel(item.updatedAt)}</small></article>;
          }) : <p className="sol-live-empty">Recent activity appears here as jobs change, without reloading the page.</p>}
        </div>
      </section>
    </div>
  </div>;
}
