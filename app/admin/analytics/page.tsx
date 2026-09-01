import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminLiveMetrics } from "@/admin-live-metrics";
import { AnalyticsSolBrief } from "@/analytics-sol-brief";
import {
  analyticsConfidence,
  analyticsRate,
  buildAnalyticsV3Signals,
  compareAnalyticsMetric,
  formatAnalyticsComparison,
  rollupPathwayCollections,
  type AnalyticsV3Comparison,
  type AnalyticsV3PathwayRow,
  type AnalyticsV3QualityRow,
  type AnalyticsV3Signal
} from "@/analytics-v3";
import { loadAnalyticsV3 } from "@/analytics-v3-server";
import { getStudioPermission } from "@/auth";
import { articles } from "@/data";
import { getSearchConsoleSnapshot, searchConsoleOpportunities } from "@/google-search-console";
import { allPathways } from "@/pathway-catalog";
import { hasStudioPermission } from "@/studio-permissions";

function deltaTone(comparison: AnalyticsV3Comparison) {
  if (comparison.direction === "up" || comparison.direction === "new") return "is-up";
  if (comparison.direction === "down") return "is-down";
  return "is-flat";
}

function MetricCard({ label, value, current, previous, ready, definition, confidenceBase }: {
  label: string;
  value: number | string;
  current: number;
  previous: number;
  ready: boolean;
  definition: string;
  confidenceBase?: number;
}) {
  const comparison = compareAnalyticsMetric(current, previous);
  const confidence = analyticsConfidence(confidenceBase ?? current + previous);
  return <article className="analytics-v3-metric">
    <div className="analytics-v3-metric-value">{value}</div>
    <strong>{label}</strong>
    <span className={ready ? deltaTone(comparison) : "is-flat"}>{ready ? formatAnalyticsComparison(comparison) : "Collecting comparison baseline"}</span>
    <details><summary>Definition</summary><p>{definition}</p><small>{confidence} sample signal</small></details>
  </article>;
}

function SignalCard({ signal }: { signal: AnalyticsV3Signal }) {
  return <article className={`analytics-v3-signal is-${signal.severity}`}>
    <div className="analytics-v3-signal-top"><span>{signal.severity}</span><b>{signal.confidence} signal</b></div>
    <h3>{signal.title}</h3>
    <p>{signal.detail}</p>
    <div className="analytics-v3-evidence-row">{signal.evidence.map((item) => <span key={`${signal.id}:${item.label}`}><b>{item.value}</b><small>{item.label}</small></span>)}</div>
    {signal.href ? <Link href={signal.href}>Open evidence →</Link> : null}
  </article>;
}

function biggestPathwayLoss(row: AnalyticsV3PathwayRow) {
  const stages = [
    { label: "Start → 25%", lost: row.starts - row.reach25 },
    { label: "25% → 50%", lost: row.reach25 - row.reach50 },
    { label: "50% → 75%", lost: row.reach50 - row.reach75 },
    { label: "75% → complete", lost: row.reach75 - row.completions }
  ];
  return stages.sort((a, b) => b.lost - a.lost)[0];
}

function PathwayCard({ row, title }: { row: AnalyticsV3PathwayRow; title: string }) {
  const loss = biggestPathwayLoss(row);
  const stages = [
    { label: "Started", value: row.starts, percent: 100 },
    { label: "25%", value: row.reach25, percent: analyticsRate(row.reach25, row.starts) },
    { label: "50%", value: row.reach50, percent: analyticsRate(row.reach50, row.starts) },
    { label: "75%", value: row.reach75, percent: analyticsRate(row.reach75, row.starts) },
    { label: "Completed", value: row.completions, percent: analyticsRate(row.completions, row.starts) }
  ];
  const starts = compareAnalyticsMetric(row.starts, row.priorStarts);
  return <article className="analytics-v3-pathway">
    <div className="analytics-v3-pathway-head">
      <div><span>PATHWAY</span><h3>{title}</h3></div>
      <Link href={`/pathways/${row.slug}`}>Open →</Link>
    </div>
    <div className="analytics-v3-pathway-stats">
      <span><b>{row.starts}</b><small>starts</small></span>
      <span><b>{row.averageProgress}%</b><small>avg. depth</small></span>
      <span><b>{row.completions} of {row.starts}</b><small>completed</small></span>
      <span><b>{row.completionRate}%</b><small>completion rate</small></span>
    </div>
    <p className="analytics-v3-pathway-change">Starts: {formatAnalyticsComparison(starts)}</p>
    <div className="analytics-v3-funnel">{stages.map((stage) => <div key={stage.label}>
      <div><span>{stage.label}</span><b>{stage.value} · {stage.percent}%</b></div>
      <i><em style={{ width: `${stage.percent}%` }}/></i>
    </div>)}</div>
    <p className="analytics-v3-drop"><strong>Biggest observed loss:</strong> {loss.label} · {Math.max(0, loss.lost)} session{loss.lost === 1 ? "" : "s"}</p>
  </article>;
}

function QualityCard({ row }: { row: AnalyticsV3QualityRow }) {
  return <article className="analytics-v3-quality-card">
    <h3>{row.label}</h3>
    <div><span><b>{row.sessions}</b><small>sessions</small></span><span><b>{row.studyRate}%</b><small>study</small></span><span><b>{row.completionRate}%</b><small>complete</small></span><span><b>{row.appRate}%</b><small>app</small></span></div>
  </article>;
}

export default async function AdminAnalyticsPage() {
  const { access, allowed } = await getStudioPermission("view_analytics");
  if (!allowed || access.state !== "allowed") redirect("/admin");

  const [{ snapshot, articles: articleRows, fallback, error }, searchConsole] = await Promise.all([
    loadAnalyticsV3(),
    getSearchConsoleSnapshot()
  ]);

  if (!snapshot) {
    return <main className="admin-main analytics-v3-page">
      <div className="analytics-v3-hero"><span className="eyebrow"><i/> Decision analytics</span><h1>Analytics V3</h1><p>Exact first-party analytics are temporarily unavailable.</p></div>
      <div className="admin-alert is-error"><strong>Analytics could not load.</strong><span>{error || "Unknown analytics error."}</span></div>
    </main>;
  }

  const catalog = new Map(allPathways.map((pathway) => [pathway.slug, pathway]));
  const pathwayRows = snapshot.pathways.map((row) => {
    const pathway = catalog.get(row.slug);
    return pathway ? { ...row, title: pathway.title, collection: pathway.collection } : null;
  }).filter((row): row is NonNullable<typeof row> => Boolean(row));
  const collections = rollupPathwayCollections(pathwayRows);
  const signals = buildAnalyticsV3Signals(snapshot, pathwayRows);
  const articleTitles = new Map(articles.map((article) => [article.slug, article.title]));
  const currentArticles = articleRows
    .filter((row) => articleTitles.has(row.slug))
    .map((row) => ({ ...row, title: articleTitles.get(row.slug) ?? row.slug }))
    .sort((a, b) => b.uniqueSessions - a.uniqueSessions)
    .slice(0, 8);
  const googleOpportunities = searchConsoleOpportunities(searchConsole);
  const c = snapshot.period.current;
  const p = snapshot.period.previous;
  const searchSuccess = Math.max(0, c.searchSessions - c.noResultSearchSessions);
  const canUseSol = Boolean(access.role && hasStudioPermission(access.role, "manage_content"));

  return <main className="admin-main analytics-v3-page">
    <header className="analytics-v3-hero">
      <span className="eyebrow"><i/> Decision analytics</span>
      <h1>Analytics V3</h1>
      <p>Know who arrived, where they came from, what they studied, where they stopped, and what deserves attention next.</p>
      <div className="analytics-v3-period"><strong>LAST 7 DAYS</strong><span>vs previous 7 days</span><b>{snapshot.period.trackingDays} tracked days</b></div>
      {fallback ? <div className="analytics-v3-baseline-note"><strong>V3 database migration pending.</strong><span>The page is safely using V2 exact aggregates until the new snapshot is available. Full comparisons and daily V3 analysis stay disabled.</span></div> : null}
    </header>

    <section className="analytics-v3-section">
      <div className="analytics-v3-section-head"><div><span>OPERATING VIEW</span><h2>This week</h2></div><p>Exact counts first. Every comparison shows the actual current and prior values.</p></div>
      <div className="analytics-v3-metrics">
        <MetricCard label="Public visitors" value={c.visitors} current={c.visitors} previous={p.visitors} ready={snapshot.period.trendReady} confidenceBase={c.visitors + p.visitors} definition="Distinct anonymous browser identities that viewed at least one public page during the period. This is a tracked browser count, not a guaranteed count of individual humans."/>
        <MetricCard label="Sessions" value={c.sessions} current={c.sessions} previous={p.sessions} ready={snapshot.period.trendReady} definition="Distinct public browsing sessions with at least one page view."/>
        <MetricCard label="Page views" value={c.pageViews} current={c.pageViews} previous={p.pageViews} ready={snapshot.period.trendReady} definition="Recorded public page_viewed events after known Studio and preview sessions are excluded."/>
        <MetricCard label="Engaged studies" value={c.engagedStudySessions} current={c.engagedStudySessions} previous={p.engagedStudySessions} ready={snapshot.period.trendReady} definition="Sessions with a completed Pathway step, meaningful article completion, Pathway completion, audio completion, or at least 30 seconds of tracked Pathway audio."/>
        <MetricCard label="Pathway starts" value={c.pathwayStartSessions} current={c.pathwayStartSessions} previous={p.pathwayStartSessions} ready={snapshot.period.trendReady} definition="Distinct public sessions that fired pathway_started during the period."/>
        <MetricCard label="Pathway completions" value={c.pathwayCompletionSessions} current={c.pathwayCompletionSessions} previous={p.pathwayCompletionSessions} ready={snapshot.period.trendReady} definition="Distinct public sessions that fired pathway_completed during the period."/>
        <MetricCard label="App transitions" value={c.appTransitionSessions} current={c.appTransitionSessions} previous={p.appTransitionSessions} ready={snapshot.period.trendReady} definition="Distinct public sessions that intentionally clicked from the website into the Apostolic Guide app."/>
        <MetricCard label="Search sessions" value={c.searchSessions} current={c.searchSessions} previous={p.searchSessions} ready={snapshot.period.trendReady} definition="Distinct public sessions that submitted at least one Apostolic Guide search."/>
      </div>
    </section>

    <section className="analytics-v3-section">
      <div className="analytics-v3-section-head"><div><span>DECISION LAYER</span><h2>What changed</h2></div><p>Rules interpret exact facts before Sol ever sees them.</p></div>
      {signals.length ? <div className="analytics-v3-signals">{signals.map((signal) => <SignalCard key={signal.id} signal={signal}/>)}</div> : <div className="analytics-v3-empty"><strong>No major rule-based warning yet.</strong><span>Keep collecting clean traffic and study behavior. V3 will surface movement when the sample supports it.</span></div>}
    </section>

    <AnalyticsSolBrief canUseSol={canUseSol}/>

    <section className="analytics-v3-section">
      <div className="analytics-v3-section-head"><div><span>DAILY MOVEMENT</span><h2>Seven-day rhythm</h2></div><p>See whether publishing activity creates a visible traffic or study response.</p></div>
      {snapshot.daily.length ? <div className="analytics-v3-days">{snapshot.daily.map((day) => <article key={day.date}>
        <strong>{new Date(`${day.date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" })}</strong>
        <span><b>{day.visitors}</b><small>visitors</small></span>
        <span><b>{day.engagedStudySessions}</b><small>study</small></span>
        <span><b>{day.pathwayStarts}</b><small>starts</small></span>
        <span><b>{day.pageViews}</b><small>views</small></span>
      </article>)}</div> : <div className="analytics-v3-empty"><strong>Daily V3 series is waiting for the new database snapshot.</strong></div>}
    </section>

    <section className="analytics-v3-section">
      <div className="analytics-v3-section-head"><div><span>PATHWAY COLLECTIONS</span><h2>What people are studying</h2></div><p>Roll individual Pathways into the four current theological collections before drilling down.</p></div>
      <div className="analytics-v3-collections">{collections.map((row) => <article key={row.collection}>
        <span>COLLECTION</span><h3>{row.collection}</h3>
        <div><b>{row.starts}</b><small>starts</small></div>
        <div><b>{row.weightedAverageProgress}%</b><small>avg. depth</small></div>
        <div><b>{row.completions} of {row.starts}</b><small>completed · {row.completionRate}%</small></div>
        <p>{row.activePathways} active Pathway{row.activePathways === 1 ? "" : "s"} in this period.</p>
      </article>)}</div>
    </section>

    <section className="analytics-v3-section">
      <div className="analytics-v3-section-head"><div><span>PATHWAY FUNNELS</span><h2>Where readers continue or stop</h2></div><p>Counts and percentages stay together so mobile can never turn “3 completions · 19%” into “319%.”</p></div>
      {pathwayRows.length ? <div className="analytics-v3-pathways">{pathwayRows.map((row) => <PathwayCard key={row.slug} row={row} title={row.title}/>)}</div> : <div className="analytics-v3-empty"><strong>No Pathway starts in this period.</strong></div>}
    </section>

    <section className="analytics-v3-section">
      <div className="analytics-v3-section-head"><div><span>ACQUISITION QUALITY</span><h2>Where useful traffic comes from</h2></div><p>Traffic volume alone is weak. Compare each source by study, completion, and app movement.</p></div>
      {snapshot.acquisition.length ? <div className="analytics-v3-acquisition">{snapshot.acquisition.map((row) => {
        const change = compareAnalyticsMetric(row.sessions, row.priorSessions);
        return <article key={row.source}>
          <div><span>SOURCE</span><h3>{row.source}</h3><small>{formatAnalyticsComparison(change)}</small></div>
          <div className="analytics-v3-source-stats"><span><b>{row.sessions}</b><small>sessions</small></span><span><b>{row.studyRate}%</b><small>study</small></span><span><b>{row.completionRate}%</b><small>complete</small></span><span><b>{row.appRate}%</b><small>app</small></span></div>
        </article>;
      })}</div> : <div className="analytics-v3-empty"><strong>No attributable public sessions in this period.</strong></div>}
    </section>

    <section className="analytics-v3-section analytics-v3-split">
      <div>
        <div className="analytics-v3-section-head"><div><span>SEARCH INTENT</span><h2>What people are asking</h2></div></div>
        <div className="analytics-v3-search-health">
          <span><b>{c.searchSessions}</b><small>search sessions</small></span>
          <span><b>{searchSuccess}</b><small>without a no-result event</small></span>
          <span><b>{analyticsRate(searchSuccess, c.searchSessions)}%</b><small>coverage proxy</small></span>
          <span><b>{c.noResultSearchSessions}</b><small>no-result sessions</small></span>
        </div>
        <div className="analytics-v3-list-block"><h3>Top searches</h3>{snapshot.searches.length ? snapshot.searches.map((row) => <div key={row.query}><span>{row.query}</span><b>{row.count}</b></div>) : <p>No search queries recorded in this period.</p>}</div>
      </div>
      <div>
        <div className="analytics-v3-section-head"><div><span>CONTENT GAPS</span><h2>Demand we are not answering</h2></div></div>
        <div className="analytics-v3-list-block is-alert">{snapshot.searchGaps.length ? snapshot.searchGaps.map((row) => <div key={row.query}><span>{row.query}</span><b>{row.count} no-result</b></div>) : <p>No no-result searches recorded in this period.</p>}</div>
      </div>
    </section>

    <section className="analytics-v3-section">
      <div className="analytics-v3-section-head"><div><span>GOOGLE SEARCH CONSOLE</span><h2>Demand before the visit</h2></div><p>Search Console is optional. Apostolic Guide analytics remains the source of truth for what happens after arrival.</p></div>
      {!searchConsole.configured ? <div className="analytics-v3-google-setup">
        <strong>Search Console is ready to connect.</strong>
        <p>Add the Apostolic Guide service account as a Search Console property user, then set these server-only environment variables:</p>
        <code>GOOGLE_SEARCH_CONSOLE_SITE_URL</code><code>GOOGLE_SERVICE_ACCOUNT_EMAIL</code><code>GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY</code>
        <span>Recommended property value: <b>sc-domain:apostolicguide.com</b></span>
      </div> : searchConsole.error || !searchConsole.current || !searchConsole.previous ? <div className="analytics-v3-inline-error"><strong>Search Console is configured but unavailable.</strong><span>{searchConsole.error || "No complete Search Console period returned."}</span></div> : <>
        <div className="analytics-v3-google-metrics">
          <MetricCard label="Google clicks" value={searchConsole.current.clicks} current={searchConsole.current.clicks} previous={searchConsole.previous.clicks} ready definition={`Final Search Console clicks for ${searchConsole.current.startDate} through ${searchConsole.current.endDate}. Google reporting is intentionally read with a two-day delay.`}/>
          <MetricCard label="Google impressions" value={searchConsole.current.impressions} current={searchConsole.current.impressions} previous={searchConsole.previous.impressions} ready definition="Times Apostolic Guide pages appeared in eligible Google Search results during the complete reporting window."/>
          <article className="analytics-v3-metric"><div className="analytics-v3-metric-value">{searchConsole.current.ctr}%</div><strong>Google CTR</strong><span>{searchConsole.current.clicks} clicks / {searchConsole.current.impressions} impressions</span><details><summary>Definition</summary><p>Search Console clicks divided by impressions.</p></details></article>
          <article className="analytics-v3-metric"><div className="analytics-v3-metric-value">{searchConsole.current.position}</div><strong>Avg. position</strong><span>Prior: {searchConsole.previous.position}</span><details><summary>Definition</summary><p>Impression-weighted average Search Console position across the returned query/page rows.</p></details></article>
        </div>
        <div className="analytics-v3-list-block"><h3>Google opportunities</h3>{googleOpportunities.length ? googleOpportunities.map((row) => <div key={`${row.kind}:${row.query}:${row.page}`}><span><b>{row.query}</b><small>{row.kind === "ctr" ? "Snippet / title opportunity" : "Ranking opportunity"} · {row.impressions} impressions · pos. {row.position} · {row.ctr}% CTR</small></span><strong>{row.clicks} clicks</strong></div>) : <p>No high-confidence Google opportunity passed the current thresholds.</p>}</div>
      </>}
    </section>

    <section className="analytics-v3-section analytics-v3-split">
      <div><div className="analytics-v3-section-head"><div><span>DEVICE QUALITY</span><h2>Does mobile behavior differ?</h2></div></div><div className="analytics-v3-quality-grid">{snapshot.devices.length ? snapshot.devices.map((row) => <QualityCard key={row.label} row={row}/>) : <div className="analytics-v3-empty"><strong>Device quality is collecting.</strong></div>}</div></div>
      <div><div className="analytics-v3-section-head"><div><span>GEOGRAPHY</span><h2>Where useful sessions come from</h2></div></div><div className="analytics-v3-quality-grid">{snapshot.countries.length ? snapshot.countries.slice(0, 8).map((row) => <QualityCard key={row.label} row={row}/>) : <div className="analytics-v3-empty"><strong>Geographic quality is collecting.</strong></div>}</div></div>
    </section>

    <section className="analytics-v3-section analytics-v3-split">
      <div><div className="analytics-v3-section-head"><div><span>TOP PAGES</span><h2>What gets viewed</h2></div></div><div className="analytics-v3-list-block">{snapshot.topPages.length ? snapshot.topPages.map((row) => <div key={row.label}><span>{row.label}</span><b>{row.count}</b></div>) : <p>No page views recorded.</p>}</div></div>
      <div><div className="analytics-v3-section-head"><div><span>CAMPAIGNS</span><h2>Tagged distribution</h2></div></div><div className="analytics-v3-list-block">{snapshot.campaigns.length ? snapshot.campaigns.map((row) => <div key={row.label}><span>{row.label}</span><b>{row.count} sessions</b></div>) : <p>No UTM campaign sessions recorded in this period.</p>}</div></div>
    </section>

    <section className="analytics-v3-section">
      <div className="analytics-v3-section-head"><div><span>ARTICLE STUDY</span><h2>Reading quality</h2></div><p>Article completion remains exact first-party study telemetry while V3 focuses the primary decision layer on the current seven-day operating window.</p></div>
      {currentArticles.length ? <div className="analytics-v3-articles">{currentArticles.map((row) => <article key={row.slug}><h3>{row.title}</h3><div><span><b>{row.uniqueSessions}</b><small>sessions</small></span><span><b>{row.completions}</b><small>completions</small></span><span><b>{row.completionRate}%</b><small>completion</small></span><span><b>{row.appTransitions}</b><small>app</small></span></div></article>)}</div> : <div className="analytics-v3-empty"><strong>No article study telemetry yet.</strong></div>}
    </section>

    <section className="analytics-v3-section">
      <div className="analytics-v3-section-head"><div><span>LIVE + DATA QUALITY</span><h2>Can we trust what we are seeing?</h2></div><p>Known Studio and Vercel-preview sessions stay outside public acquisition metrics.</p></div>
      <AdminLiveMetrics/>
      <div className="analytics-v3-data-quality">
        <span><b>{snapshot.internalSessionsExcluded}</b><small>internal sessions excluded this week</small></span>
        <span><b>{snapshot.period.trackingDays}</b><small>tracked days</small></span>
        <span><b>{snapshot.period.trendReady ? "Ready" : "Collecting"}</b><small>two-period comparison</small></span>
        <span><b>{searchConsole.configured ? (searchConsole.error ? "Needs attention" : "Connected") : "Optional"}</b><small>Google Search Console</small></span>
      </div>
    </section>
  </main>;
}
