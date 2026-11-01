import Link from "next/link";
import { Activity, AlertCircle, ArrowUpRight, BarChart3, Inbox, Route, Search, Smartphone, UserPlus, Users } from "lucide-react";
import { getStudioIntelligence } from "@/studio-intelligence";

function trendText(change: number | null) {
  if (change === null) return "new";
  if (change === 0) return "flat";
  return `${change > 0 ? "+" : ""}${change}%`;
}

function trendClass(change: number | null) {
  if (change === null || change > 0) return "is-up";
  if (change < 0) return "is-down";
  return "is-flat";
}

export default async function StudioAppHomePage() {
  const intelligence = await getStudioIntelligence();
  const { metrics, trends } = intelligence;
  const prioritySignals = intelligence.signals.filter((signal) => signal.priority === "urgent" || signal.priority === "high");
  const pulse = [
    { label: "Study", current: trends.studySessions.current, previous: trends.studySessions.previous },
    { label: "Search", current: trends.searches.current, previous: trends.searches.previous },
    { label: "App", current: trends.appTransitions.current, previous: trends.appTransitions.previous },
    { label: "Subs", current: trends.newSubscribers.current, previous: trends.newSubscribers.previous }
  ];
  const pulseMax = Math.max(1, ...pulse.flatMap((item) => [item.current, item.previous]));

  return <main className="studio-app-home">
    <header className="studio-app-home-head">
      <div><span>Studio</span><h1>Dashboard</h1></div>
      <Link href="/admin/analytics" aria-label="Open analytics"><BarChart3 size={20}/></Link>
    </header>

    <section className="studio-app-stat-grid" aria-label="Key Studio metrics">
      <article><Activity size={18}/><strong>{metrics.studySessions7d}</strong><span>Study sessions</span><small className={trendClass(trends.studySessions.changePercent)}>{trendText(trends.studySessions.changePercent)} vs last 7d</small></article>
      <article><Search size={18}/><strong>{metrics.searches7d}</strong><span>Searches</span><small className={trendClass(trends.searches.changePercent)}>{trendText(trends.searches.changePercent)} vs last 7d</small></article>
      <article><Users size={18}/><strong>{metrics.subscribersTotal}</strong><span>Subscribers</span><small>{metrics.newSubscribers7d} new this week</small></article>
      <article><AlertCircle size={18}/><strong>{prioritySignals.length}</strong><span>Priority items</span><small>{prioritySignals.length ? "needs attention" : "all clear"}</small></article>
    </section>

    <section className="studio-app-pulse-card">
      <div className="studio-app-section-head"><div><span>7 day pulse</span><strong>This week vs last week</strong></div><div className="studio-app-chart-key"><i/>Now <i/>Before</div></div>
      <div className="studio-app-pulse-chart">
        {pulse.map((item) => <div className="studio-app-pulse-group" key={item.label}>
          <div className="studio-app-pulse-bars" aria-label={`${item.label}: ${item.current} now, ${item.previous} before`}>
            <i className="is-current" style={{ height: `${Math.max(5, Math.round(item.current / pulseMax * 100))}%` }}/>
            <i className="is-previous" style={{ height: `${Math.max(5, Math.round(item.previous / pulseMax * 100))}%` }}/>
          </div>
          <strong>{item.current}</strong><span>{item.label}</span>
        </div>)}
      </div>
    </section>

    <section className="studio-app-mini-grid" aria-label="Operational metrics">
      <article><UserPlus size={16}/><strong>{metrics.newSubscribers7d}</strong><span>New subs</span></article>
      <article><Smartphone size={16}/><strong>{metrics.appTransitions7d}</strong><span>App clicks</span></article>
      <article><Inbox size={16}/><strong>{metrics.unreadConversations}</strong><span>Unread</span></article>
      <article><Route size={16}/><strong>{metrics.activeJourneys}</strong><span>Journeys</span></article>
      <article className="is-wide"><Search size={16}/><strong>{metrics.noResultRate7d}%</strong><span>No-result search rate</span></article>
    </section>

    <section className="studio-app-attention-card">
      <div className="studio-app-section-head"><div><span>Attention</span><strong>{prioritySignals.length ? "What needs you" : "Nothing urgent"}</strong></div><Link href="/admin">Full overview <ArrowUpRight size={14}/></Link></div>
      {prioritySignals.length ? <div className="studio-app-attention-list">
        {prioritySignals.slice(0, 2).map((signal) => <Link href={signal.action?.href ?? "/admin"} key={signal.id}><span>{signal.title}</span><ArrowUpRight size={16}/></Link>)}
      </div> : <p>Inbox, journeys, and system signals are clear right now.</p>}
    </section>
  </main>;
}
