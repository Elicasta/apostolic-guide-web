"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { TerminalSquare, Upload } from "lucide-react";

type RunRecord = {
  id: string;
  command: string;
  action: string | null;
  classification: "read" | "private_write" | "public_effect" | null;
  status: "ok" | "error" | "blocked";
  summary: string;
  createdAt: string;
};

type WorkbenchResponse = {
  status: "ok" | "error" | "blocked";
  action: string | null;
  classification: RunRecord["classification"];
  approvalRequired: boolean;
  summary: string;
  data: Record<string, unknown>;
  session: {
    id: string;
    context: { pathwaySlug: string | null; projectId: string | null };
    records: RunRecord[];
  };
  error?: string;
};

const EXAMPLES = [
  "status",
  "what needs attention",
  "list pathways",
  "show pathway god-is-one",
  "show proposals",
  "show runs",
  "show creative projects",
  "preview feed",
  "What needs attention this week?",
  "Show me the God Is One Pathway.",
  "What is Sol waiting on?",
  "Show me the latest creative projects.",
  "publish now"
];

function chip(result: Pick<WorkbenchResponse, "status" | "classification" | "approvalRequired"> | null) {
  if (!result) return "READ";
  if (result.approvalRequired || result.classification === "public_effect") return "APPROVAL REQUIRED";
  if (result.status === "blocked" || result.status === "error") return "BLOCKED";
  if (result.classification === "private_write") return "PRIVATE";
  return "READ";
}

function sessionStorageKey() {
  return "apostolic-guide-grokbot-session";
}

export function GrokbotWorkbench() {
  const [command, setCommand] = useState("status");
  const [sessionId, setSessionId] = useState<string | null>(null);

  function rememberedSessionId() {
    if (typeof window === "undefined") return sessionId;
    if (sessionId) return sessionId;
    const stored = window.sessionStorage.getItem(sessionStorageKey());
    return stored && /^[0-9a-f-]{36}$/i.test(stored) ? stored : null;
  }
  const [context, setContext] = useState<{ pathwaySlug: string | null; projectId: string | null }>({ pathwaySlug: null, projectId: null });
  const [records, setRecords] = useState<RunRecord[]>([]);
  const [result, setResult] = useState<WorkbenchResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadNote, setUploadNote] = useState("Drop a private reference here. This batch does not upload it.");
  const outputRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (sessionId) window.sessionStorage.setItem(sessionStorageKey(), sessionId);
  }, [sessionId]);

  const output = useMemo(() => result?.data && Object.keys(result.data).length ? JSON.stringify(result.data, null, 2) : "", [result]);

  async function run(text: string) {
    const nextCommand = text.trim();
    if (!nextCommand || busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/admin/grokbot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ command: nextCommand, sessionId: rememberedSessionId(), context })
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
        return;
      }
      setResult(data);
      setSessionId(data.session.id);
      setContext(data.session.context);
      setRecords(data.session.records);
      outputRef.current?.scrollIntoView({ block: "nearest" });
    } catch (error) {
      setResult({
        status: "error",
        action: null,
        classification: null,
        approvalRequired: false,
        summary: error instanceof Error ? error.message : "Grokbot could not run that command.",
        data: {},
        session: { id: sessionId ?? "", context, records }
      });
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void run(command);
  }

  function noteFiles(files: FileList | null) {
    if (!files?.length) return;
    const summary = [...files].slice(0, 8).map((file) => `${file.name} (${Math.ceil(file.size / 1024)} KB)`).join(", ");
    setUploadNote(`Received ${files.length} file${files.length === 1 ? "" : "s"} locally: ${summary}. No asset id was created and nothing was published.`);
    setRecords((current) => [...current, {
      id: `upload-${Date.now()}`,
      command: "drop files",
      action: null,
      classification: null,
      status: "blocked",
      summary: "Upload shell only. Follow-up: connect this drop zone to the existing Pathway Asset ingest at /admin/assets. No asset id was created.",
      createdAt: new Date().toISOString()
    }]);
  }

  return <div className="grokbot-page">
    <div className="grokbot-shell">
      <section className="grokbot-terminal" aria-label="Grokbot command terminal">
        <header><TerminalSquare size={16}/><div><span>Command terminal</span><h2>Operate through registered actions</h2></div></header>
        <div className="grokbot-examples">
          {EXAMPLES.map((example) => <button type="button" key={example} onClick={() => { setCommand(example); void run(example); }}>{example}</button>)}
        </div>
        <form onSubmit={submit}>
          <label htmlFor="grokbot-command">Command</label>
          <textarea id="grokbot-command" rows={3} value={command} onChange={(event) => setCommand(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void run(command); } }} placeholder="status"/>
          <button type="submit" disabled={busy || !command.trim()}>{busy ? "Running" : "Run"}</button>
        </form>
        <div className="grokbot-context" aria-label="Current context">
          {result ? <span className={`grokbot-chip is-${chip(result).toLowerCase().replaceAll(" ", "-")}`}>{chip(result)}</span> : <span>Ready</span>}
          <span>Pathway {context.pathwaySlug || "none"}</span>
          <span>Project {context.projectId || "none"}</span>
          <span>Session {sessionId ? sessionId.slice(0, 8) : "new"}</span>
        </div>
      </section>

      <aside className="grokbot-side">
        <section ref={outputRef} className="grokbot-output" aria-live="polite">
          <header><span>Result</span><h3>{result?.action || "Waiting for a command"}</h3></header>
          <p>{result?.summary || "Commands resolve to the shared Action Registry. Public effects stop here."}</p>
          {output ? <pre>{output}</pre> : null}
        </section>
        <section className="grokbot-log" aria-label="Run log">
          <header><span>Run log</span><h3>Command to action</h3></header>
          {records.length ? <ol>{[...records].reverse().map((record) => <li key={record.id}><strong>{record.command}</strong><em>{record.action || "unresolved"} · {record.status}</em><span>{record.summary}</span></li>)}</ol> : <p>The transcript appears after the first command.</p>}
        </section>
        <section className="grokbot-drop" aria-label="Private file drop" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); noteFiles(event.dataTransfer.files); }}>
          <header><Upload size={16}/><div><span>Private drop</span><h3>Reference files stay private</h3></div></header>
          <label>
            <input type="file" multiple onChange={(event) => { noteFiles(event.target.files); event.target.value = ""; }}/>
            <span>Drop images or files, or choose them. They are not uploaded in this batch.</span>
          </label>
          <p>{uploadNote}</p>
          <p>Follow-up: reuse Pathway Asset ingest at /admin/assets. Do not add a second upload pipeline here.</p>
        </section>
      </aside>
    </div>
  </div>;
}
