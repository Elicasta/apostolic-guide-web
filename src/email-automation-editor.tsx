"use client";

import { useState } from "react";
import { CheckCircle2, Eye, Mail, PauseCircle, PlayCircle, Save, Send } from "lucide-react";
import type { WelcomeAutomation, WelcomeDeliveryActivity } from "./email-automations";
import type { WelcomeCopy, EmailAutomationStatus } from "./welcome-automation-config";

const fields: Array<{ key: keyof WelcomeCopy; label: string; hint?: string }> = [
  { key: "subject", label: "Subject" },
  { key: "previewText", label: "Inbox preview" },
  { key: "headline", label: "Headline" },
  { key: "greeting", label: "Greeting" },
  { key: "body", label: "Welcome message" },
  { key: "buttonLabel", label: "Button text" },
  { key: "buttonUrl", label: "Button destination", hint: "Use an Apostolic Guide HTTPS URL." }
];

export function WelcomeAutomationEditor({
  initial, deliveries, canManage
}: { initial: WelcomeAutomation; deliveries: WelcomeDeliveryActivity[]; canManage: boolean }) {
  const [status, setStatus] = useState<EmailAutomationStatus>(initial.status);
  const [copy, setCopy] = useState<WelcomeCopy>(initial.copy);
  const [revision, setRevision] = useState(initial.revision);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState("");
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [dirty, setDirty] = useState(false);

  async function api(body: unknown) {
    const response = await fetch("/api/admin/email-automations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json().catch(() => ({})) as { error?: string; message?: string; revision?: number };
    if (!response.ok) throw new Error(result.error || "Request failed.");
    return result;
  }
  async function save() {
    setWorking(true); setMessage("");
    try {
      const result = await api({ action: "save", revision, status, copy });
      setRevision(result.revision ?? revision + 1);
      setDirty(false);
      setMessage("Saved. New subscribers will use this version.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Save failed."); }
    finally { setWorking(false); }
  }
  async function sendTest() {
    if (!window.confirm("Send this preview only to your Studio account email address?")) return;
    setWorking(true); setMessage("");
    try {
      const result = await api({ action: "test", copy });
      setMessage(result.message || "Test email sent.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Test failed."); }
    finally { setWorking(false); }
  }
  async function renderPreview() {
    setWorking(true); setMessage("");
    try {
      const response = await fetch("/api/admin/email-automations/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ copy }) });
      const result = await response.json().catch(() => ({})) as { html?: string; error?: string };
      if (!response.ok || !result.html) throw new Error(result.error ?? "Preview unavailable.");
      setPreview(result.html);
      setMode("preview");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Preview unavailable."); }
    finally { setWorking(false); }
  }
  const sent = deliveries.filter((row) => row.status === "sent").length;
  const failed = deliveries.filter((row) => ["failed","uncertain"].includes(row.status)).length;
  return <div className="email-auto">
    {!initial.available ? <div className="email-auto-warning" role="alert">Email automation storage is not ready. Apply the migration in Supabase before enabling or editing this workflow. The previous welcome message remains the reference design.</div> : null}
    <div className="email-auto-overview">
      <div><Mail size={19}/><span>Automation</span><strong>Welcome email</strong><small>New email subscriber · Immediate</small></div>
      <div><CheckCircle2 size={19}/><span>Accepted by Resend</span><strong>{sent}</strong><small>Last {deliveries.length} delivery records</small></div>
      <div><PauseCircle size={19}/><span>Needs attention</span><strong>{failed}</strong><small>Failed or uncertain</small></div>
    </div>
    <section className="admin-card publishing-card">
      <div className="card-heading"><div><span className="section-kicker">Trigger</span><h2>New subscriber → Welcome</h2></div>
        <span className={status === "active" ? "status-pill" : "status-pill status-pending"}>{status}</span></div>
      <p>Sent once when an email is first subscribed. No email is sent on preference updates or repeat signups. Pausing prevents new sends and pauses queued retries.</p>
      <div className="email-auto-status">
        <label htmlFor="welcome-status">Automation status</label>
        <select id="welcome-status" disabled={!canManage || working || !initial.available} value={status} onChange={(event) => { setStatus(event.target.value as EmailAutomationStatus); setDirty(true); }}>
          <option value="active">Active · send automatically</option>
          <option value="paused">Paused · do not send</option>
        </select>
        {status === "active" ? <PlayCircle size={18}/> : <PauseCircle size={18}/>}
      </div>
    </section>
    <section className="admin-card publishing-card">
      <div className="card-heading"><div><span className="section-kicker">Message</span><h2>Edit welcome email</h2></div>
        <div className="email-auto-tabs">
          <button type="button" className={mode === "edit" ? "selected" : ""} onClick={() => setMode("edit")}>Edit</button>
          <button type="button" className={mode === "preview" ? "selected" : ""} onClick={renderPreview} disabled={working}><Eye size={15}/> Preview</button>
        </div>
      </div>
      {mode === "edit" ? <div className="email-auto-fields">
        {fields.map(({ key, label, hint }) => <label key={key}>{label}{key === "body"
          ? <textarea disabled={!canManage || !initial.available} value={copy[key]} rows={5} maxLength={1500} onChange={(event) => { setCopy({ ...copy, [key]: event.target.value }); setDirty(true); }}/>
          : <input disabled={!canManage || !initial.available} type={key === "buttonUrl" ? "url" : "text"} value={copy[key]} onChange={(event) => { setCopy({ ...copy, [key]: event.target.value }); setDirty(true); }}/>}
          {hint ? <small>{hint}</small> : null}
        </label>)}
      </div> : <div className="email-auto-preview"><iframe title="Welcome email preview" sandbox="" srcDoc={preview}/></div>}
      <div className="email-auto-actions">
        <span role="status" aria-live="polite">{message || (dirty ? "Unsaved changes" : "")}</span>
        {canManage ? <div>
          <button className="button" type="button" disabled={working || !initial.available} onClick={sendTest}><Send size={16}/> Send test to me</button>
          <button className="button button-crimson" type="button" disabled={working || !dirty || !initial.available} onClick={save}><Save size={16}/> {working ? "Working…" : "Save automation"}</button>
        </div> : <p>Read-only access</p>}
      </div>
    </section>
    <section className="admin-card publishing-card">
      <div className="card-heading"><div><span className="section-kicker">History</span><h2>Recent welcome deliveries</h2></div><span>{deliveries.length} records</span></div>
      {deliveries.length ? <div className="email-auto-deliveries">
        {deliveries.map((row) => <div className="email-auto-delivery" key={row.id}>
          <div><strong>{row.email_subscribers?.email || "Subscriber"}</strong>
            <small>{new Date(row.created_at).toLocaleString()} · {row.attempts} attempt(s){row.last_error ? " · " + row.last_error : ""}</small></div>
          <span className={row.status === "sent" ? "status-pill" : "status-pill status-pending"}>{row.status}</span>
        </div>)}
      </div> : <p>No deliveries logged yet. Historical welcome emails are not backfilled into this new ledger.</p>}
    </section>
  </div>;
}
