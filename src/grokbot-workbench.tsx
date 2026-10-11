"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { TerminalSquare, Upload } from "lucide-react";
import { classifyWorkbenchFile, uploadWorkbenchFile } from "@/grokbot-upload";

type RunRecord = {
  id: string;
  command: string;
  action: string | null;
  classification: "read" | "private_write" | "public_effect" | null;
  status: "ok" | "error" | "blocked" | "pending";
  summary: string;
  createdAt: string;
};

type SessionContext = { pathwaySlug: string | null; projectId: string | null; planId: string | null };
type SessionSummary = { id: string; status: "active" | "archived"; updatedAt: string; context: SessionContext; runCount: number };
type PlanSlot = {
  id: string;
  position: number;
  slotDate: string;
  title: string;
  pathwaySlug: string | null;
  goal: string;
  reason: string;
  suggestedTopic: string;
  whyNow: string;
  nextSteps: string;
  status: "idea" | "draft" | "prepared" | "ready-for-review" | "blocked";
  proposalKind: string;
};
type PrivatePlan = {
  id: string;
  title: string;
  timezone: string;
  startsOn: string;
  revision: number;
  slots: PlanSlot[];
  revisions?: Array<{ revision: number; reason: string; changes: string[] }>;
  updatedAt?: string;
};
type ScratchNote = { id: string; title: string; body: string; kind: "text" | "hook" | "outline"; canonical: false };
type LinkedAsset = { id: string; assetId: string; filename: string; mimeType: string; bytes: number; use: "reference" | "draft_source"; previewUrl: string | null; storage: "private" };
type WorkbenchResponse = {
  status: "ok" | "error" | "blocked";
  action: string | null;
  classification: RunRecord["classification"];
  approvalRequired: boolean;
  summary: string;
  data: Record<string, unknown>;
  session: { id: string; status?: "active" | "archived"; context: SessionContext; records: RunRecord[] };
  error?: string;
};
type UploadRow = { id: string; name: string; progress: number; phase: string; error?: string; assetId?: string; duplicate?: boolean };

const EXAMPLES = ["status", "list pathways", "show pathway god-is-one", "plan next 14 days", "create a 14 day plan", "list plans", "show scratch", "preview feed"];
const SLOT_STATUSES = ["idea", "draft", "prepared", "ready-for-review", "blocked"] as const;
const SESSION_KEY = "apostolic-guide-grokbot-session";

function chip(result: Pick<WorkbenchResponse, "status" | "classification" | "approvalRequired"> | null) {
  if (!result) return "READ";
  if (result.approvalRequired || result.classification === "public_effect") return "APPROVAL REQUIRED";
  if (result.status === "blocked" || result.status === "error") return "BLOCKED";
  if (result.classification === "private_write") return "PRIVATE";
  return "READ";
}

function asPlan(data: Record<string, unknown> | undefined): PrivatePlan | null {
  const plan = data?.plan;
  if (!plan || typeof plan !== "object") return null;
  const value = plan as PrivatePlan;
  if (!value.id || !Array.isArray(value.slots)) return null;
  return value;
}

export function GrokbotWorkbench({ pathways, persistenceConfigured }: { pathways: Array<{ slug: string; title: string }>; persistenceConfigured: boolean }) {
  const [command, setCommand] = useState("status");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [context, setContext] = useState<SessionContext>({ pathwaySlug: null, projectId: null, planId: null });
  const [records, setRecords] = useState<RunRecord[]>([]);
  const [result, setResult] = useState<WorkbenchResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [plans, setPlans] = useState<Array<{ id: string; title: string; revision: number; startsOn: string }>>([]);
  const [plan, setPlan] = useState<PrivatePlan | null>(null);
  const [planMessage, setPlanMessage] = useState("");
  const [scratchTitle, setScratchTitle] = useState("");
  const [scratchBody, setScratchBody] = useState("");
  const [scratchKind, setScratchKind] = useState<"text" | "hook" | "outline">("text");
  const [notes, setNotes] = useState<ScratchNote[]>([]);
  const [assets, setAssets] = useState<LinkedAsset[]>([]);
  const [pathwaySlug, setPathwaySlug] = useState(pathways[0]?.slug ?? "");
  const [assetUse, setAssetUse] = useState<"reference" | "draft_source">("reference");
  const [uploads, setUploads] = useState<UploadRow[]>([]);
  const [uploadNote, setUploadNote] = useState(persistenceConfigured ? "Drop a file to upload it through Pathway Assets." : "Persistence is not configured, so uploads cannot be linked to a durable session.");

  async function call(body: Record<string, unknown>) {
    const response = await fetch("/api/admin/grokbot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, sessionId: sessionId ?? undefined, context })
    });
    const data = await response.json().catch(() => null) as WorkbenchResponse | null;
    if (!response.ok || !data?.session) {
      const summary = data?.error || data?.summary || "Grokbot could not run that command.";
      setResult({
        status: "error",
        action: null,
        classification: null,
        approvalRequired: false,
        summary,
        data: {},
        session: { id: sessionId ?? "", context, records }
      });
      return null;
    }
    setResult(data);
    setSessionId(data.session.id);
    setContext({ ...data.session.context, planId: data.session.context.planId ?? null });
    setRecords(data.session.records ?? []);
    const opened = asPlan(data.data);
    if (opened) setPlan(opened);
    if (data.data.conflict === true) setPlanMessage(data.summary);
    return data;
  }

  useEffect(() => {
    const stored = window.localStorage.getItem(SESSION_KEY) || window.sessionStorage.getItem(SESSION_KEY);
    void (async () => {
      const response = await fetch("/api/admin/grokbot", { cache: "no-store" });
      const data = await response.json().catch(() => null) as { sessions?: SessionSummary[]; error?: string } | null;
      if (!response.ok) {
        setUploadNote(data?.error || "Grokbot sessions could not be loaded.");
        return;
      }
      setSessions(data?.sessions ?? []);
      if (stored && data?.sessions?.some((session) => session.id === stored && session.status === "active")) {
        const resumed = await fetch(`/api/admin/grokbot?sessionId=${stored}`, { cache: "no-store" });
        const session = await resumed.json().catch(() => null) as { session?: { id: string; context: SessionContext; records: RunRecord[] } } | null;
        if (resumed.ok && session?.session) {
          setSessionId(session.session.id);
          setContext({ ...session.session.context, planId: session.session.context.planId ?? null });
          setRecords(session.session.records ?? []);
          if (session.session.context.pathwaySlug) setPathwaySlug(session.session.context.pathwaySlug);
        }
      }
    })();
  }, []);

  useEffect(() => {
    if (sessionId) window.localStorage.setItem(SESSION_KEY, sessionId);
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    void (async () => {
      const response = await fetch("/api/admin/grokbot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "plan.list", command: "plan.list", input: {}, sessionId })
      });
      const data = await response.json().catch(() => null) as WorkbenchResponse | null;
      if (response.ok && Array.isArray(data?.data.plans)) setPlans(data.data.plans as Array<{ id: string; title: string; revision: number; startsOn: string }>);
      const scratch = await fetch("/api/admin/grokbot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "scratch.list", command: "scratch.list", input: {}, sessionId })
      });
      const scratchData = await scratch.json().catch(() => null) as WorkbenchResponse | null;
      if (scratch.ok && Array.isArray(scratchData?.data.notes)) setNotes(scratchData.data.notes as ScratchNote[]);
      const asset = await fetch("/api/admin/grokbot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "asset.list", command: "asset.list", input: {}, sessionId })
      });
      const assetData = await asset.json().catch(() => null) as WorkbenchResponse | null;
      if (asset.ok && Array.isArray(assetData?.data.assets)) setAssets(assetData.data.assets as LinkedAsset[]);
    })();
  }, [sessionId]);

  const output = useMemo(() => result?.data && Object.keys(result.data).length ? JSON.stringify(result.data, null, 2) : "", [result]);
  const suggestion = result?.data.suggestionOnly === true;

  async function run(text: string) {
    const nextCommand = text.trim();
    if (!nextCommand || busy) return;
    setBusy(true);
    try { await call({ command: nextCommand }); }
    finally { setBusy(false); }
  }

  async function runWrite(action: string, actionInput: Record<string, unknown>, label: string) {
    setBusy(true);
    setPlanMessage("");
    try {
      return await call({ action, command: label, input: actionInput, requestId: crypto.randomUUID() });
    } finally { setBusy(false); }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void run(command);
  }

  function updateSlot(id: string, patch: Partial<PlanSlot>) {
    setPlan((current) => current ? { ...current, slots: current.slots.map((slot) => slot.id === id ? { ...slot, ...patch } : slot) } : current);
  }

  async function savePlan() {
    if (!plan) return;
    const saved = await runWrite("plan.update", {
      planId: plan.id,
      expectedRevision: plan.revision,
      reason: "Edited on the Planning Desk.",
      title: plan.title,
      timezone: plan.timezone,
      slots: plan.slots.map((slot) => ({
        id: slot.id,
        title: slot.title,
        status: slot.status,
        goal: slot.goal,
        reason: slot.reason,
        suggestedTopic: slot.suggestedTopic,
        whyNow: slot.whyNow,
        nextSteps: slot.nextSteps
      }))
    }, "plan.update");
    if (saved?.data.conflict === true) setPlanMessage(saved.summary);
    else if (saved?.status === "ok") setPlanMessage(`Saved revision ${String(saved.data.revision)}. Nothing was published.`);
  }

  async function moveSlot(id: string, direction: -1 | 1) {
    if (!plan) return;
    const ordered = [...plan.slots].sort((left, right) => left.position - right.position).map((slot) => slot.id);
    const index = ordered.indexOf(id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ordered.length) return;
    const next = [...ordered];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved!);
    const saved = await runWrite("plan.reorder", {
      planId: plan.id,
      expectedRevision: plan.revision,
      orderedSlotIds: next,
      reason: "Reordered on the Planning Desk."
    }, "plan.reorder");
    if (saved?.data.conflict === true) setPlanMessage(saved.summary);
  }

  async function uploadFiles(files: File[]) {
    if (!files.length) return;
    if (!pathwaySlug) {
      setUploadNote("Choose a Pathway before uploading. Pathway Assets require one, and nothing was uploaded.");
      return;
    }
    for (const file of files) {
      const id = crypto.randomUUID();
      const classified = classifyWorkbenchFile(file);
      if (!classified.ok) {
        setUploads((current) => [...current, { id, name: file.name, progress: 0, phase: "failed", error: classified.error }]);
        continue;
      }
      setUploads((current) => [...current, { id, name: file.name, progress: 1, phase: "reading" }]);
      try {
        const uploaded = await uploadWorkbenchFile({
          file,
          pathwaySlug,
          onProgress: (progress) => setUploads((current) => current.map((row) => row.id === id ? { ...row, progress: progress.percent, phase: progress.phase } : row))
        });
        if (!uploaded.assetId) throw new Error("The server did not return an asset id.");
        setUploads((current) => current.map((row) => row.id === id ? { ...row, phase: "linking", progress: 97, assetId: uploaded.assetId, duplicate: uploaded.duplicate } : row));
        const linked = await call({
          action: "asset.link",
          command: `asset.link ${uploaded.assetId}`,
          input: { assetId: uploaded.assetId, use: assetUse },
          requestId: crypto.randomUUID()
        });
        if (!linked || linked.status !== "ok" || linked.data.assetId !== uploaded.assetId) {
          throw new Error(linked?.summary || "The asset was uploaded but not linked. It is not shown as saved.");
        }
        setUploads((current) => current.map((row) => row.id === id ? { ...row, phase: uploaded.duplicate ? "duplicate" : "saved", progress: 100, assetId: uploaded.assetId } : row));
        setAssets((current) => [{
          id: String(linked.data.linkId || uploaded.assetId),
          assetId: uploaded.assetId,
          filename: uploaded.filename,
          mimeType: uploaded.mimeType,
          bytes: uploaded.bytes,
          use: assetUse,
          previewUrl: typeof linked.data.previewUrl === "string" ? linked.data.previewUrl : uploaded.previewUrl,
          storage: "private"
        }, ...current.filter((asset) => asset.assetId !== uploaded.assetId)]);
        setUploadNote(uploaded.duplicate ? `Linked the existing private asset ${uploaded.assetId}.` : `Saved private asset ${uploaded.assetId}.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Upload failed.";
        setUploads((current) => current.map((row) => row.id === id ? { ...row, phase: "failed", error: message } : row));
        setUploadNote(message);
      }
    }
  }

  return <div className="grokbot-page">
    <div className="grokbot-shell">
      <section className="grokbot-terminal" aria-label="Grokbot command terminal">
        <header><TerminalSquare size={16}/><div><span>Command terminal</span><h2>Operate through registered actions</h2></div></header>
        <label className="grokbot-session">
          <span>Session</span>
          <select aria-label="Grokbot session" value={sessionId ?? ""} onChange={(event) => {
            const next = event.target.value;
            if (!next) { window.localStorage.removeItem(SESSION_KEY); setSessionId(null); setRecords([]); setPlan(null); return; }
            setSessionId(next);
            void fetch(`/api/admin/grokbot?sessionId=${next}`).then(async (response) => {
              const data = await response.json().catch(() => null) as { session?: { id: string; context: SessionContext; records: RunRecord[] }; error?: string } | null;
              if (!response.ok || !data?.session) { setPlanMessage(data?.error || "That session was not found."); return; }
              setContext({ ...data.session.context, planId: data.session.context.planId ?? null });
              setRecords(data.session.records ?? []);
            });
          }}>
            <option value="">New session</option>
            {sessions.filter((session) => session.status === "active").map((session) => <option key={session.id} value={session.id}>{session.id.slice(0, 8)} · {session.runCount} runs</option>)}
          </select>
          <button type="button" disabled={!sessionId || busy} onClick={() => { if (sessionId) void runWrite("session.archive", { sessionId }, "session.archive").then((saved) => { if (saved?.status !== "ok") return; window.localStorage.removeItem(SESSION_KEY); setSessions((current) => current.map((session) => session.id === sessionId ? { ...session, status: "archived" } : session)); setSessionId(null); setRecords([]); }); }}>Archive</button>
        </label>
        <div className="grokbot-examples">
          {EXAMPLES.map((example) => <button type="button" key={example} onClick={() => { setCommand(example); void run(example); }}>{example}</button>)}
        </div>
        <form onSubmit={submit}>
          <label htmlFor="grokbot-command">Command</label>
          <textarea id="grokbot-command" rows={3} value={command} onChange={(event) => setCommand(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void run(command); } }} placeholder="status"/>
          <button type="submit" disabled={busy || !command.trim()}>{busy ? "Running" : "Run"}</button>
        </form>
        <div className="grokbot-context" aria-label="Current context">
          {result ? <span className={`grokbot-chip is-${chip(result).toLowerCase().replaceAll(" ", "-")}`}>{chip(result)}</span> : <span>{persistenceConfigured ? "Ready" : "Persistence unavailable"}</span>}
          <span>Pathway {context.pathwaySlug || "none"}</span>
          <span>Plan {context.planId ? context.planId.slice(0, 8) : "none"}</span>
          <span>Session {sessionId ? sessionId.slice(0, 8) : "new"}</span>
        </div>
      </section>

      <aside className="grokbot-side">
        <section className="grokbot-output" aria-live="polite">
          <header><span>Result</span><h3>{result?.action || "Waiting for a command"}</h3></header>
          <p>{result?.summary || "Commands resolve to the shared Action Registry. Public effects stop here."}</p>
          {output ? <pre>{output}</pre> : null}
        </section>
        <section className="grokbot-log" aria-label="Run log">
          <header><span>Run log</span><h3>Command to action</h3></header>
          {records.length ? <ol>{[...records].reverse().map((record) => <li key={record.id}><strong>{record.command}</strong><em>{record.action || "unresolved"} · {record.status}</em><span>{record.summary}</span></li>)}</ol> : <p>The transcript appears after the first command.</p>}
        </section>
      </aside>
    </div>

    <div className="grokbot-work">
      <section className="grokbot-desk" aria-label="Planning Desk">
        <header><span>Planning Desk</span><h3>Private 14-day draft</h3></header>
        <div className="grokbot-row">
          <button type="button" disabled={busy} onClick={() => void runWrite("plan.create", { days: 14, timezone: "America/New_York" }, "plan.create").then((saved) => { const opened = asPlan(saved?.data); if (opened) setPlans((current) => [{ id: opened.id, title: opened.title, revision: opened.revision, startsOn: opened.startsOn }, ...current]); })}>Create 14-day plan</button>
          <button type="button" disabled={busy || !plan} onClick={() => void savePlan()}>Save</button>
          <button type="button" disabled={busy || !plan} onClick={() => { if (!plan) return; void runWrite("plan.duplicate", { planId: plan.id }, "plan.duplicate"); }}>Duplicate</button>
          <button type="button" disabled={busy || !plan} onClick={() => { if (!plan) return; void call({ action: "plan.inspect", command: "plan.inspect", input: { planId: plan.id } }); }}>Reload</button>
        </div>
        {plans.length ? <label>Saved plans<select aria-label="Saved plans" value={plan?.id ?? ""} onChange={(event) => { if (event.target.value) void call({ action: "plan.inspect", command: "plan.inspect", input: { planId: event.target.value } }); }}><option value="">Choose a saved plan</option>{plans.map((item) => <option key={item.id} value={item.id}>{item.title} · rev {item.revision}</option>)}</select></label> : <p>No saved plan yet. Creating one copies the canonical editorial window into a private draft.</p>}
        {planMessage ? <p className="grokbot-conflict" role="alert">{planMessage}</p> : null}
        {plan ? <div className="grokbot-plan">
          <p>Saved private plan · revision {plan.revision} · {plan.timezone} · starts {plan.startsOn}. Nothing here is scheduled or published.</p>
          <label>Title<input value={plan.title} onChange={(event) => setPlan({ ...plan, title: event.target.value })}/></label>
          <ol className="grokbot-slots">{plan.slots.map((slot) => <li key={slot.id}>
            <div className="grokbot-row"><strong>{slot.slotDate}</strong><span>{slot.pathwaySlug}</span><span>{slot.proposalKind}</span>
              <button type="button" aria-label={`Move ${slot.slotDate} earlier`} onClick={() => void moveSlot(slot.id, -1)}>Up</button>
              <button type="button" aria-label={`Move ${slot.slotDate} later`} onClick={() => void moveSlot(slot.id, 1)}>Down</button>
            </div>
            <label>Title<input value={slot.title} onChange={(event) => updateSlot(slot.id, { title: event.target.value })}/></label>
            <label>Status<select value={slot.status} onChange={(event) => updateSlot(slot.id, { status: event.target.value as PlanSlot["status"] })}>{SLOT_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
            <p>{slot.suggestedTopic}</p>
            <p>{slot.whyNow}</p>
            <p>{slot.nextSteps}</p>
          </li>)}</ol>
          {plan.revisions?.length ? <p>Latest reason: {plan.revisions.at(-1)?.reason}</p> : null}
        </div> : null}
      </section>

      <section className="grokbot-scratch" aria-label="Scratch pad">
        <header><span>Scratch</span><h3>Private notes, not canonical</h3></header>
        <form onSubmit={(event) => { event.preventDefault(); void runWrite("scratch.save", { title: scratchTitle, body: scratchBody, kind: scratchKind }, "scratch.save").then((saved) => { const note = saved?.data.note as ScratchNote | undefined; if (note) setNotes((current) => [note, ...current]); setScratchTitle(""); setScratchBody(""); }); }}>
          <label>Title<input value={scratchTitle} onChange={(event) => setScratchTitle(event.target.value)} required maxLength={120}/></label>
          <label>Kind<select value={scratchKind} onChange={(event) => setScratchKind(event.target.value as typeof scratchKind)}><option value="text">text</option><option value="hook">hook</option><option value="outline">outline</option></select></label>
          <label>Note<textarea value={scratchBody} onChange={(event) => setScratchBody(event.target.value)} required maxLength={8000}/></label>
          <button type="submit" disabled={busy || !scratchTitle.trim() || !scratchBody.trim()}>Save scratch</button>
        </form>
        {notes.length ? <ul>{notes.map((note) => <li key={note.id}><strong>{note.title}</strong><em>{note.kind} · not canonical</em><p>{note.body}</p></li>)}</ul> : <p>Saved scratch notes appear here after the server stores them.</p>}
        <p>Promoting scratch into a Studio draft is not available from this desk. There is no separate private draft action wired here, and this pad does not write Pathway source.</p>
      </section>

      <section className="grokbot-preview" aria-label="Preview dock">
        <header><span>Preview dock</span><h3>{plan ? "Saved plan" : suggestion ? "Suggestion only" : "Nothing selected"}</h3></header>
        {plan ? <p>This preview matches saved revision {plan.revision}. It is a private draft, not a published artifact.</p> : null}
        {suggestion ? <p>This editorial preview was not saved. It is a suggestion only.</p> : null}
        <ul>{(plan?.slots ?? []).map((slot) => <li key={slot.id}>{slot.slotDate}: {slot.title} · {slot.status}</li>)}</ul>
        {assets.length ? <div className="grokbot-assets">{assets.map((asset) => <article key={asset.id}>
          {asset.previewUrl && asset.mimeType.startsWith("image/") ? (
            // Private signed URLs and the authenticated file route are not Next image remote patterns.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={asset.previewUrl} alt=""/>
          ) : <div className="grokbot-file">{asset.mimeType}</div>}
          <strong>{asset.filename}</strong>
          <span>{asset.assetId}</span>
          <span>{asset.mimeType} · {asset.bytes} bytes · {asset.use} · private</span>
        </article>)}</div> : <p>Linked private assets show their Pathway asset id after a real upload.</p>}
      </section>

      <section className="grokbot-drop" aria-label="Private file drop" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void uploadFiles(Array.from(event.dataTransfer.files)); }}>
        <header><Upload size={16}/><div><span>Private drop</span><h3>Pathway Assets</h3></div></header>
        <label>Pathway<select aria-label="Upload pathway" value={pathwaySlug} onChange={(event) => setPathwaySlug(event.target.value)}>{pathways.map((pathway) => <option key={pathway.slug} value={pathway.slug}>{pathway.title}</option>)}</select></label>
        <label>Use<select aria-label="Asset use" value={assetUse} onChange={(event) => setAssetUse(event.target.value as typeof assetUse)}><option value="reference">reference</option><option value="draft_source">draft source</option></select></label>
        <label className="grokbot-file-input">
          <input type="file" multiple accept="image/png,image/jpeg,image/webp,video/mp4,video/quicktime,video/webm,audio/mpeg,audio/wav,audio/mp4,application/pdf,application/zip" onChange={(event) => { void uploadFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }}/>
          <span>Drop files or choose them from Photos or Files. Images use the private Pathway upload. Larger masters use private Pathway ingest.</span>
        </label>
        <ul>{uploads.map((row) => <li key={row.id}><strong>{row.name}</strong><span>{row.phase} · {row.progress}%</span>{row.assetId ? <span>Asset {row.assetId}</span> : null}{row.error ? <span role="alert">{row.error}</span> : null}{row.phase === "failed" ? <button type="button" onClick={() => setUploadNote("Choose the file again to retry. The previous attempt did not save.")}>Retry</button> : null}</li>)}</ul>
        <p>{uploadNote}</p>
      </section>
    </div>
  </div>;
}
