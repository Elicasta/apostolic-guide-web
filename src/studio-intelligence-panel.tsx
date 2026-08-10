import Link from "next/link";
import { ArrowRight, BrainCircuit, CircleAlert, CircleCheck, Gauge, Search, Sparkles } from "lucide-react";
import type { IntelligencePriority, StudioIntelligenceSnapshot } from "./intelligence-engine";

function priorityIcon(priority: IntelligencePriority) {
  if (priority === "urgent" || priority === "high") return CircleAlert;
  if (priority === "info") return CircleCheck;
  return Gauge;
}

export function StudioIntelligencePanel({ snapshot }: { snapshot: StudioIntelligenceSnapshot }) {
  const topSignals = snapshot.signals.slice(0, 6);
  const urgent = snapshot.signals.filter((signal) => signal.priority === "urgent").length;
  const high = snapshot.signals.filter((signal) => signal.priority === "high").length;

  return <section className="admin-card studio-intelligence-card">
    <div className="studio-section-head">
      <div><span className="section-kicker">Deterministic intelligence</span><h2>What deserves attention</h2></div>
      <span><BrainCircuit size={14}/> Rules calculate the evidence. AI can interpret it later, but nothing here requires AI.</span>
    </div>

    <div className="studio-intelligence-summary">
      <div><strong>{urgent + high}</strong><span>High-priority items</span></div>
      <div><strong>{snapshot.metrics.studySessions7d}</strong><span>Study sessions / 7d</span></div>
      <div><strong>{snapshot.metrics.searches7d}</strong><span>Searches / 7d</span></div>
      <div><strong>{snapshot.metrics.noResultRate7d}%</strong><span>No-result rate</span></div>
    </div>

    {topSignals.length ? <div className="studio-intelligence-list">
      {topSignals.map((signal) => {
        const Icon = priorityIcon(signal.priority);
        return <article className={`studio-intelligence-signal is-${signal.priority}`} key={signal.id}>
          <span className="studio-intelligence-icon"><Icon size={16}/></span>
          <div><div className="studio-intelligence-title"><strong>{signal.title}</strong><span>{signal.priority}</span></div><p>{signal.summary}</p><small>{signal.evidence.slice(0, 3).map((item) => `${item.label}: ${item.value}`).join(" · ")}</small></div>
          {signal.action ? <Link href={signal.action.href}>{signal.action.label}<ArrowRight size={14}/></Link> : null}
        </article>;
      })}
    </div> : <div className="studio-intelligence-empty"><CircleCheck size={20}/><div><strong>No rule-based alerts are active.</strong><p>The engine is still calculating study, search, relationship, journey, growth, and system signals.</p></div></div>}

    <div className="studio-intelligence-footer">
      <span><Sparkles size={14}/> AI interpretation boundary ready</span>
      <span><Search size={14}/> Exact search gaps remain deterministic; semantic clustering can be optional AI later.</span>
    </div>
  </section>;
}
