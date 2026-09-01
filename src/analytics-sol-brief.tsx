"use client";

import { useState } from "react";
import { BrainCircuit, ChevronDown, Loader2, RefreshCw } from "lucide-react";

type SolAnalyticsResponse = {
  mode?: "sol" | "deterministic";
  provider?: string | null;
  summary?: string;
  observed?: string[];
  interpretation?: string[];
  recommendations?: string[];
  evidence?: Array<{ label: string; value: string }>;
  error?: string;
};

export function AnalyticsSolBrief({ canUseSol }: { canUseSol: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<SolAnalyticsResponse | null>(null);
  const [error, setError] = useState("");

  async function explain() {
    setOpen(true);
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/analytics/interpret", { method: "POST", headers: { "content-type": "application/json" } });
      const payload = await response.json().catch(() => ({})) as SolAnalyticsResponse;
      if (!response.ok) throw new Error(payload.error || `Sol analytics request failed (${response.status}).`);
      setData(payload);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sol could not interpret this period.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="analytics-v3-sol">
    <div className="analytics-v3-sol-head">
      <div>
        <span className="analytics-v3-kicker">Optional interpretation</span>
        <h2>Sol&apos;s read</h2>
        <p>The numbers and rules above remain the source of truth. Sol only explains the evidence when you ask.</p>
      </div>
      {canUseSol ? <button type="button" onClick={() => data ? setOpen((value) => !value) : void explain()} disabled={busy}>
        {busy ? <Loader2 className="is-spinning" size={16}/> : data ? <ChevronDown size={16}/> : <BrainCircuit size={16}/>}
        {busy ? "Reading data" : data ? (open ? "Hide read" : "Show read") : "Explain this week"}
      </button> : <span className="analytics-v3-muted-chip">Deterministic only</span>}
    </div>

    {open ? <div className="analytics-v3-sol-body">
      {error ? <div className="analytics-v3-inline-error"><strong>Sol could not load.</strong><span>{error}</span><button type="button" onClick={() => void explain()}><RefreshCw size={14}/> Retry</button></div> : null}
      {data ? <>
        <div className="analytics-v3-sol-mode"><span>{data.mode === "sol" ? "SOL INTERPRETATION" : "DETERMINISTIC FALLBACK"}</span>{data.provider ? <b>{data.provider}</b> : null}</div>
        {data.summary ? <p className="analytics-v3-sol-summary">{data.summary}</p> : null}
        <div className="analytics-v3-sol-columns">
          <div><h3>Observed</h3>{(data.observed ?? []).map((item) => <p key={item}>{item}</p>)}</div>
          <div><h3>Interpretation</h3>{(data.interpretation ?? []).map((item) => <p key={item}>{item}</p>)}</div>
          <div><h3>Recommended move</h3>{(data.recommendations ?? []).map((item) => <p key={item}>{item}</p>)}</div>
        </div>
        {(data.evidence ?? []).length ? <details className="analytics-v3-evidence"><summary>View evidence</summary><div>{data.evidence?.map((item) => <span key={`${item.label}:${item.value}`}><b>{item.value}</b><small>{item.label}</small></span>)}</div></details> : null}
      </> : null}
    </div> : null}
  </section>;
}
