"use client";

import { useMemo, useState } from "react";
import { Bot, Check, Clock3, FlaskConical, Loader2, MessageCircleReply, RotateCcw, Save, ShieldCheck, TriangleAlert } from "lucide-react";
import type { CommentGuideDashboard, CommentGuideJob, CommentGuideSettings } from "./comment-guide-runtime";

type SimulationResult = {
  model: string;
  promptVersion: string;
  explicitKeywordGate: { automationId: string; keyword: string } | null;
  decision: {
    intent: string;
    action: string;
    contentionLevel: string;
    confidence: number;
    pathwaySlug: string | null;
    publicReply: string | null;
    privateReply: string | null;
    delaySeconds: number;
    internalReason: string;
    doctrineReview: { approved?: boolean; correctionReason?: string | null } | null;
  };
};

function statusClass(status: string) {
  if (status === "sent") return "status-pill";
  if (status === "failed") return "status-pill status-error";
  if (status === "shadowed") return "status-pill comment-guide-shadow-pill";
  if (status === "ignored") return "status-pill comment-guide-muted-pill";
  return "status-pill status-pending";
}

function delayLabel(seconds: number) {
  if (seconds < 60) return `${seconds} sec`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes}m ${remainder}s` : `${minutes} min`;
}

export function CommentGuideManager(props: {
  dashboard: CommentGuideDashboard;
  canManage: boolean;
  openAIConfigured: boolean;
  instagramConfigured: boolean;
}) {
  const [settings, setSettings] = useState<CommentGuideSettings>(props.dashboard.settings);
  const [jobs, setJobs] = useState<CommentGuideJob[]>(props.dashboard.recentJobs);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(props.dashboard.error);
  const [comment, setComment] = useState("This is modalism. Why did Jesus pray?");
  const [simulating, setSimulating] = useState(false);
  const [simulation, setSimulation] = useState<SimulationResult | null>(null);
  const [simulationError, setSimulationError] = useState<string | null>(null);
  const ready = props.dashboard.dbReady && props.openAIConfigured && props.instagramConfigured;
  const modeDescription = useMemo(() => ({
    paused: "No new comments are classified or answered.",
    shadow: "Sol reads and drafts every comment, but nothing is posted.",
    live: "Approved replies and guide handoffs post automatically after their human-style delay."
  })[settings.mode], [settings.mode]);

  async function post(body: Record<string, unknown>) {
    const response = await fetch("/api/admin/comment-guide", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) throw new Error(typeof json.error === "string" ? json.error : `Request failed (${response.status}).`);
    return json;
  }

  async function saveSettings() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const json = await post({
        action: "update_settings",
        mode: settings.mode,
        positiveRepliesEnabled: settings.positiveRepliesEnabled,
        publicKeywordAckEnabled: settings.publicKeywordAckEnabled,
        dailyReplyLimit: settings.dailyReplyLimit
      });
      if (json.settings && typeof json.settings === "object") setSettings(json.settings as CommentGuideSettings);
      setMessage(settings.mode === "live" ? "Comment Guide is live and fully automatic." : `Comment Guide saved in ${settings.mode} mode.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save Comment Guide settings.");
    } finally {
      setSaving(false);
    }
  }

  async function simulate() {
    if (!comment.trim()) return;
    setSimulating(true);
    setSimulation(null);
    setSimulationError(null);
    try {
      const json = await post({ action: "simulate", comment: comment.trim() });
      setSimulation(json.simulation as SimulationResult);
    } catch (caught) {
      setSimulationError(caught instanceof Error ? caught.message : "Could not run the Sol simulation.");
    } finally {
      setSimulating(false);
    }
  }

  async function retry(jobId: number) {
    setError(null);
    try {
      const json = await post({ action: "retry_job", jobId });
      const retry = json.retry as { status?: string } | undefined;
      setJobs((current) => current.map((job) => job.id === jobId ? { ...job, status: retry?.status ?? "classification_retry", last_error: null } : job));
      setMessage(`Comment ${jobId} is queued for another safe attempt.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not retry the comment.");
    }
  }

  return <div className="comment-guide-stack">
    {!ready ? <div className="admin-card comment-guide-readiness">
      <ShieldCheck size={20}/>
      <div><strong>Setup is not complete.</strong><p>{!props.dashboard.dbReady ? "Apply the Comment Guide database migration. " : ""}{!props.openAIConfigured ? "Add OPENAI_API_KEY. " : ""}{!props.instagramConfigured ? "Connect Instagram in Social automations." : ""}</p></div>
    </div> : null}

    {message ? <div className="form-success comment-guide-banner"><Check size={16}/>{message}</div> : null}
    {error ? <div className="form-error comment-guide-banner">{error}</div> : null}

    <section className="admin-card comment-guide-control-card">
      <div className="card-heading"><div><span className="section-kicker">Operating mode</span><h2>Hands-off, with a safe launch switch</h2></div><p>{modeDescription}</p></div>
      <div className="comment-guide-controls">
        <div className="comment-guide-mode-grid" role="radiogroup" aria-label="Comment Guide mode">
          {(["paused", "shadow", "live"] as const).map((mode) => <button type="button" role="radio" aria-checked={settings.mode === mode} className={settings.mode === mode ? `comment-guide-mode is-${mode} is-selected` : `comment-guide-mode is-${mode}`} onClick={() => setSettings((current) => ({ ...current, mode }))} disabled={!props.canManage || !props.dashboard.dbReady} key={mode}>
            <span>{mode === "paused" ? "Paused" : mode === "shadow" ? "Shadow" : "Live"}</span>
            <small>{mode === "paused" ? "Stop" : mode === "shadow" ? "Read only" : "Auto reply"}</small>
          </button>)}
        </div>

        <div className="comment-guide-setting-grid">
          <label className="comment-guide-check"><input type="checkbox" checked={settings.positiveRepliesEnabled} onChange={(event) => setSettings((current) => ({ ...current, positiveRepliesEnabled: event.target.checked }))} disabled={!props.canManage}/><span><strong>Answer positive comments</strong><small>Short, varied replies such as “Thank you! 🙏” after a natural delay.</small></span></label>
          <label className="comment-guide-check"><input type="checkbox" checked={settings.publicKeywordAckEnabled} onChange={(event) => setSettings((current) => ({ ...current, publicKeywordAckEnabled: event.target.checked }))} disabled={!props.canManage}/><span><strong>Public keyword acknowledgement</strong><small>“Your guide is on the way. Check your DMs.” before the existing OPEN handoff.</small></span></label>
          <label className="comment-guide-limit"><span><strong>Daily reply ceiling</strong><small>A hard brake for unexpected comment spikes.</small></span><input type="number" min={1} max={5000} value={settings.dailyReplyLimit} onChange={(event) => setSettings((current) => ({ ...current, dailyReplyLimit: Math.min(Math.max(Number(event.target.value) || 1, 1), 5000) }))} disabled={!props.canManage}/></label>
        </div>

        <div className="comment-guide-save-row"><div><Bot size={17}/><span><strong>GPT-5.6 Sol only</strong><small>No fallback model. Unsafe or unavailable means no reply.</small></span></div><button className="button button-crimson" type="button" onClick={saveSettings} disabled={!props.canManage || !props.dashboard.dbReady || saving}>{saving ? <Loader2 className="spin" size={16}/> : <Save size={16}/>} Save controls</button></div>
      </div>
    </section>

    <section className="admin-card comment-guide-simulator">
      <div className="card-heading"><div><span className="section-kicker">Safe simulation</span><h2>See exactly what Sol would do</h2></div><p>This runs both doctrine passes when needed. It never posts to Instagram.</p></div>
      <div className="comment-guide-sim-grid">
        <div className="comment-guide-sim-input"><label htmlFor="comment-guide-test">Instagram comment</label><textarea id="comment-guide-test" value={comment} onChange={(event) => setComment(event.target.value)} maxLength={5000}/><button className="button button-outline" type="button" onClick={simulate} disabled={!props.canManage || !props.dashboard.dbReady || !props.openAIConfigured || simulating}>{simulating ? <Loader2 className="spin" size={16}/> : <FlaskConical size={16}/>} Run through Sol</button></div>
        <div className="comment-guide-sim-output">
          {simulationError ? <div className="comment-guide-simulation-error" role="alert"><TriangleAlert size={24}/><strong>Sol stopped this draft safely.</strong><p>{simulationError}</p></div> : simulation ? <>
            <div className="comment-guide-decision-head"><span className="status-pill">{simulation.decision.intent.replaceAll("_", " ")}</span><strong>{simulation.decision.action.replaceAll("_", " ")}</strong><small>{Math.round(simulation.decision.confidence * 100)}% confidence</small></div>
            {simulation.explicitKeywordGate ? <div className="comment-guide-gate"><ShieldCheck size={16}/><span>Exact keyword gate: <strong>{simulation.explicitKeywordGate.keyword}</strong></span></div> : null}
            {simulation.decision.publicReply ? <blockquote>{simulation.decision.publicReply}</blockquote> : <div className="comment-guide-no-reply">No public reply</div>}
            {simulation.decision.privateReply ? <div className="comment-guide-private"><MessageCircleReply size={16}/><span><strong>Private handoff</strong>{simulation.decision.privateReply}</span></div> : null}
            <div className="comment-guide-sim-meta"><span><Clock3 size={14}/> {delayLabel(simulation.decision.delaySeconds)} delay</span><span>Pathway: {simulation.decision.pathwaySlug ?? "none"}</span><span>Review: {simulation.decision.internalReason.startsWith("Server-written safe fallback:") ? "safe fallback" : simulation.decision.doctrineReview?.approved ? "approved" : simulation.decision.doctrineReview ? "stopped" : "not needed"}</span></div>
          </> : <div className="comment-guide-placeholder"><Bot size={30}/><strong>Sol’s decision will appear here.</strong><p>Try a compliment, JESUS, a sincere question, or a gotcha comment.</p></div>}
        </div>
      </div>
    </section>

    <section className="admin-card publishing-card comment-guide-activity">
      <div className="card-heading"><div><span className="section-kicker">Decision log</span><h2>Recent comments</h2></div><p>The log shows what Sol saw, the lane it chose, its Pathway, and whether anything was sent.</p></div>
      {jobs.length ? <div className="comment-guide-job-list">{jobs.map((job) => <div className="comment-guide-job" key={job.id}>
        <div className="comment-guide-job-copy"><div><span className="content-kind">{job.intent?.replaceAll("_", " ") ?? "waiting for Sol"}</span><small>{new Date(job.event_at).toLocaleString()}</small></div><strong>“{job.inbound_text}”</strong>{job.public_reply_text ? <p>Reply: {job.public_reply_text}</p> : null}<small>{job.pathway_slug ? `Pathway: ${job.pathway_slug} · ` : ""}{job.last_error ?? job.action?.replaceAll("_", " ") ?? "Queued"}</small></div>
        <div className="comment-guide-job-end"><span className={statusClass(job.status)}>{job.status.replaceAll("_", " ")}</span>{job.status === "failed" && props.canManage ? <button type="button" onClick={() => retry(job.id)} title="Retry safely"><RotateCcw size={15}/></button> : null}</div>
      </div>)}</div> : <div className="empty-state"><Bot size={24}/><strong>No comments have reached Sol yet.</strong><p>Webhook comments will appear here after the migration and deployment are live.</p></div>}
    </section>
  </div>;
}
