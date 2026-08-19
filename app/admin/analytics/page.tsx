import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminLiveMetrics } from "@/admin-live-metrics";
import { getStudioPermission } from "@/auth";
import { articles } from "@/data";
import { allPathways } from "@/pathway-catalog";
import { createServiceClient } from "@/supabase";

type MetricRow = [string, number];

type AnalyticsMetrics = {
  total_events: number;
  page_views: number;
  unique_browsers: number;
  browser_sessions: number;
  active_browsers: number;
  active_sessions: number;
  app_transition_events: number;
  app_transition_sessions: number;
  searches: number;
  missing_searches: number;
  article_completions: number;
  pathway_completions: number;
  known_pathway_completers: number;
  first_event: string | null;
  latest_event: string | null;
};

type DecisionMetrics = {
  engaged_study_sessions: number;
  returning_browsers: number;
  public_page_views: number;
  public_unique_browsers: number;
  public_browser_sessions: number;
  public_active_browsers: number;
  public_active_sessions: number;
  weekly_page_views: number;
  weekly_visitors: number;
  weekly_sessions: number;
  weekly_new_browsers: number;
  weekly_returning_browsers: number;
  weekly_returning_share: number;
  weekly_engaged_study_sessions: number;
  prior_week_engaged_study_sessions: number;
  weekly_pathway_start_sessions: number;
  weekly_pathway_completion_sessions: number;
  weekly_app_transition_sessions: number;
  weekly_internal_sessions: number;
  tracking_days: number;
  trend_ready: boolean;
  seven_day_cohort_size: number;
  seven_day_returned: number;
  seven_day_return_rate: number | null;
  thirty_day_cohort_size: number;
  thirty_day_returned: number;
  thirty_day_return_rate: number | null;
  search_sessions: number;
  search_success_sessions: number;
  search_success_rate: number;
  search_result_opens: number;
  search_no_result_sessions: number;
};

type AcquisitionRow = {
  source: string;
  sessions: number;
  engagedSessions: number;
  completionSessions: number;
  appSessions: number;
  studyRate: number;
  completionRate: number;
  appRate: number;
};

type PathwayFunnelRow = {
  slug: string;
  starts: number;
  reach25: number;
  reach50: number;
  reach75: number;
  completions: number;
  completionRate: number;
  averageProgress: number;
};

type PathwayAnalyticsRow = {
  slug: string;
  starts: number;
  audioStarts: number;
  uniqueSessions: number;
  observedSteps: number;
  reachedFinalStep: number;
  completions: number;
  readingCompletions: number;
  audioCompletions: number;
  knownCompleters: number;
  completionRate: number;
  averageProgress: number;
  appTransitions: number;
};

type ArticleAnalyticsRow = {
  slug: string;
  opens: number;
  uniqueSessions: number;
  completions: number;
  completionRate: number;
  appTransitions: number;
};

type DecisionSnapshot = {
  metrics: DecisionMetrics;
  acquisition: AcquisitionRow[];
  pathwayFunnel: PathwayFunnelRow[];
};

type AnalyticsSnapshot = {
  metrics: AnalyticsMetrics;
  eventCounts: MetricRow[];
  topPages: MetricRow[];
  trafficSources: MetricRow[];
  devices: MetricRow[];
  countries: MetricRow[];
  cities: MetricRow[];
  browsers: MetricRow[];
  operatingSystems: MetricRow[];
  campaigns: MetricRow[];
  mediums: MetricRow[];
  searches: MetricRow[];
  missingSearches: MetricRow[];
  appOrigins: MetricRow[];
  pathways: PathwayAnalyticsRow[];
  articles: ArticleAnalyticsRow[];
  v2: DecisionSnapshot;
};

const emptyMetrics: AnalyticsMetrics = {
  total_events: 0,
  page_views: 0,
  unique_browsers: 0,
  browser_sessions: 0,
  active_browsers: 0,
  active_sessions: 0,
  app_transition_events: 0,
  app_transition_sessions: 0,
  searches: 0,
  missing_searches: 0,
  article_completions: 0,
  pathway_completions: 0,
  known_pathway_completers: 0,
  first_event: null,
  latest_event: null
};

const emptyDecisionMetrics: DecisionMetrics = {
  engaged_study_sessions: 0,
  returning_browsers: 0,
  public_page_views: 0,
  public_unique_browsers: 0,
  public_browser_sessions: 0,
  public_active_browsers: 0,
  public_active_sessions: 0,
  weekly_page_views: 0,
  weekly_visitors: 0,
  weekly_sessions: 0,
  weekly_new_browsers: 0,
  weekly_returning_browsers: 0,
  weekly_returning_share: 0,
  weekly_engaged_study_sessions: 0,
  prior_week_engaged_study_sessions: 0,
  weekly_pathway_start_sessions: 0,
  weekly_pathway_completion_sessions: 0,
  weekly_app_transition_sessions: 0,
  weekly_internal_sessions: 0,
  tracking_days: 0,
  trend_ready: false,
  seven_day_cohort_size: 0,
  seven_day_returned: 0,
  seven_day_return_rate: null,
  thirty_day_cohort_size: 0,
  thirty_day_returned: 0,
  thirty_day_return_rate: null,
  search_sessions: 0,
  search_success_sessions: 0,
  search_success_rate: 0,
  search_result_opens: 0,
  search_no_result_sessions: 0
};

const emptySnapshot: AnalyticsSnapshot = {
  metrics: emptyMetrics,
  eventCounts: [],
  topPages: [],
  trafficSources: [],
  devices: [],
  countries: [],
  cities: [],
  browsers: [],
  operatingSystems: [],
  campaigns: [],
  mediums: [],
  searches: [],
  missingSearches: [],
  appOrigins: [],
  pathways: [],
  articles: [],
  v2: { metrics: emptyDecisionMetrics, acquisition: [], pathwayFunnel: [] }
};

function percent(part: number, total: number) {
  return total ? `${Math.min(100, Math.round((part / total) * 100))}%` : "0%";
}

function retention(rate: number | null, cohort: number) {
  return cohort > 0 && rate !== null ? `${rate}%` : "Collecting";
}

function studyTrend(current: number, prior: number, ready: boolean) {
  if (!ready) return "Collecting baseline";
  if (!prior) return current ? "New study activity" : "No change";
  const change = Math.round(((current - prior) / prior) * 100);
  return `${change >= 0 ? "+" : ""}${change}% vs prior 7 days`;
}

function asSnapshot(value: unknown): AnalyticsSnapshot {
  if (!value || typeof value !== "object") return emptySnapshot;
  const snapshot = value as Partial<AnalyticsSnapshot>;
  const decision = snapshot.v2 ?? emptySnapshot.v2;
  return {
    metrics: { ...emptyMetrics, ...(snapshot.metrics ?? {}) },
    eventCounts: snapshot.eventCounts ?? [],
    topPages: snapshot.topPages ?? [],
    trafficSources: snapshot.trafficSources ?? [],
    devices: snapshot.devices ?? [],
    countries: snapshot.countries ?? [],
    cities: snapshot.cities ?? [],
    browsers: snapshot.browsers ?? [],
    operatingSystems: snapshot.operatingSystems ?? [],
    campaigns: snapshot.campaigns ?? [],
    mediums: snapshot.mediums ?? [],
    searches: snapshot.searches ?? [],
    missingSearches: snapshot.missingSearches ?? [],
    appOrigins: snapshot.appOrigins ?? [],
    pathways: snapshot.pathways ?? [],
    articles: snapshot.articles ?? [],
    v2: {
      metrics: { ...emptyDecisionMetrics, ...(decision.metrics ?? {}) },
      acquisition: decision.acquisition ?? [],
      pathwayFunnel: decision.pathwayFunnel ?? []
    }
  };
}

export default async function AdminAnalyticsPage() {
  const { access, allowed } = await getStudioPermission("view_analytics");
  if (!allowed || access.state !== "allowed") redirect("/admin");

  const service = createServiceClient();
  let snapshot = emptySnapshot;
  let subscriberCount = 0;
  let loadError = "";

  if (service) {
    const [snapshotResult, subscribersResult] = await Promise.all([
      service.schema("analytics").rpc("dashboard_snapshot_v2"),
      service.from("email_subscribers")
        .select("id", { head: true, count: "exact" })
        .eq("status", "subscribed")
    ]);

    snapshot = asSnapshot(snapshotResult.data);
    subscriberCount = subscribersResult.count ?? 0;
    if (snapshotResult.error) loadError = `${snapshotResult.error.code}: ${snapshotResult.error.message}`;
    if (subscribersResult.error && !loadError) loadError = `${subscribersResult.error.code}: ${subscribersResult.error.message}`;
  } else {
    loadError = "Supabase service credentials are not configured in this environment.";
  }

  const metrics = snapshot.metrics;
  const decisions = snapshot.v2.metrics;
  const pathwayTitles = new Map(allPathways.map((pathway) => [pathway.slug, pathway.title]));
  const articleTitles = new Map(articles.map((article) => [article.slug, article.title]));
  const pathwayIntelligence = snapshot.pathways
    .filter((row) => pathwayTitles.has(row.slug))
    .map((row) => ({ ...row, title: pathwayTitles.get(row.slug) ?? row.slug }))
    .slice(0, 12);
  const pathwayFunnel = snapshot.v2.pathwayFunnel
    .filter((row) => pathwayTitles.has(row.slug))
    .map((row) => ({ ...row, title: pathwayTitles.get(row.slug) ?? row.slug }))
    .slice(0, 12);
  const articleIntelligence = snapshot.articles
    .filter((row) => articleTitles.has(row.slug))
    .map((row) => ({ ...row, title: articleTitles.get(row.slug) ?? row.slug }))
    .slice(0, 12);

  const attention: { title: string; detail: string }[] = [];
  if (decisions.trend_ready && decisions.prior_week_engaged_study_sessions > 0) {
    const change = Math.round(((decisions.weekly_engaged_study_sessions - decisions.prior_week_engaged_study_sessions) / decisions.prior_week_engaged_study_sessions) * 100);
    if (change <= -20) attention.push({ title: "Engaged study is down", detail: `${Math.abs(change)}% lower than the previous seven-day period.` });
  }
  for (const [query, count] of snapshot.missingSearches.slice(0, 2)) {
    attention.push({ title: `Search gap: ${query}`, detail: `${count} no-result search${count === 1 ? "" : "es"}. This is a content or search-index candidate.` });
  }
  for (const row of pathwayFunnel.filter((item) => item.starts >= 3 && item.completionRate < 25).slice(0, 2)) {
    attention.push({ title: `${row.title} loses readers early`, detail: `${row.starts} observed starts with a ${row.completionRate}% completion rate.` });
  }
  for (const row of snapshot.v2.acquisition.filter((item) => item.sessions >= 5 && item.studyRate < 10).slice(0, 1)) {
    attention.push({ title: `${row.source} traffic is not studying deeply`, detail: `${row.sessions} sessions with a ${row.studyRate}% engaged-study rate in the last seven days.` });
  }

  return (
    <>
      <AdminLiveMetrics />
      <span className="eyebrow">Decision analytics</span>
      <h1>Analytics V2</h1>
      <p className="admin-lede">Measure whether people arrive, study, finish, move into the app, and come back. The first row is the seven-day operating view, not a vanity-traffic summary.</p>
      <p className="admin-muted">Known Studio and Vercel-preview sessions are excluded from public visitor and acquisition metrics. Engaged study requires a completed Pathway step, a meaningful article completion, a Pathway completion, or at least 30 seconds of tracked Pathway audio.</p>

      {loadError ? <section className="admin-card"><h2>Tracker status</h2><p><strong>Analytics reporting is unavailable.</strong></p><p>{loadError}</p><p>Apply the Analytics V2 migrations and confirm the production Supabase service key is configured.</p></section> : null}

      <section>
        <div className="studio-section-head"><div><span className="section-kicker">Last 7 days</span><h2>Operating health</h2></div><p>{studyTrend(decisions.weekly_engaged_study_sessions, decisions.prior_week_engaged_study_sessions, decisions.trend_ready)}</p></div>
        <div className="metric-grid">
          <div className="metric"><strong>{decisions.weekly_visitors}</strong><span>Public visitors</span></div>
          <div className="metric"><strong>{decisions.weekly_engaged_study_sessions}</strong><span>Engaged studies</span></div>
          <div className="metric"><strong>{decisions.weekly_pathway_start_sessions}</strong><span>Pathway starts</span></div>
          <div className="metric"><strong>{decisions.weekly_pathway_completion_sessions}</strong><span>Pathway completions</span></div>
          <div className="metric"><strong>{decisions.weekly_app_transition_sessions}</strong><span>App transition sessions</span></div>
          <div className="metric"><strong>{decisions.weekly_returning_browsers}</strong><span>Returning visitors</span></div>
        </div>
      </section>

      <div className="analytics-operations-grid">
        <section className="admin-card">
          <span className="section-kicker">North star</span>
          <h2>Engaged study sessions</h2>
          <p><strong>{decisions.weekly_engaged_study_sessions}</strong> sessions studied meaningfully in the last seven days.</p>
          <table className="admin-table"><tbody>
            <tr><td>Study rate</td><td><strong>{percent(decisions.weekly_engaged_study_sessions, decisions.weekly_sessions)}</strong></td></tr>
            <tr><td>Public sessions</td><td><strong>{decisions.weekly_sessions}</strong></td></tr>
            <tr><td>Pathway start rate</td><td><strong>{percent(decisions.weekly_pathway_start_sessions, decisions.weekly_sessions)}</strong></td></tr>
            <tr><td>Session → app rate</td><td><strong>{percent(decisions.weekly_app_transition_sessions, decisions.weekly_sessions)}</strong></td></tr>
          </tbody></table>
        </section>

        <section className="admin-card">
          <span className="section-kicker">Retention</span>
          <h2>Are people coming back?</h2>
          <table className="admin-table"><tbody>
            <tr><td>New visitors, 7 days</td><td><strong>{decisions.weekly_new_browsers}</strong></td></tr>
            <tr><td>Returning visitors, 7 days</td><td><strong>{decisions.weekly_returning_browsers}</strong></td></tr>
            <tr><td>Returning share</td><td><strong>{decisions.weekly_returning_share}%</strong></td></tr>
            <tr><td>7-day retention</td><td><strong>{retention(decisions.seven_day_return_rate, decisions.seven_day_cohort_size)}</strong><small>{decisions.seven_day_cohort_size ? `${decisions.seven_day_returned}/${decisions.seven_day_cohort_size} eligible browsers` : " waiting for a complete cohort"}</small></td></tr>
            <tr><td>30-day retention</td><td><strong>{retention(decisions.thirty_day_return_rate, decisions.thirty_day_cohort_size)}</strong><small>{decisions.thirty_day_cohort_size ? `${decisions.thirty_day_returned}/${decisions.thirty_day_cohort_size} eligible browsers` : " waiting for a complete cohort"}</small></td></tr>
          </tbody></table>
        </section>
      </div>

      <section className="admin-card">
        <div className="study-intelligence-card-head"><div><span className="section-kicker">Needs attention</span><h2>What should change next?</h2></div><span className="admin-muted">Rule-based signals, no AI guesswork</span></div>
        {attention.length ? <table className="admin-table"><tbody>{attention.slice(0, 5).map((item) => <tr key={`${item.title}-${item.detail}`}><td><strong>{item.title}</strong><small>{item.detail}</small></td></tr>)}</tbody></table> : <p>No threshold-based issues are firing yet. More usage will make this section more useful.</p>}
      </section>

      <section className="admin-card">
        <div className="study-intelligence-card-head"><div><span className="section-kicker">Pathway funnel</span><h2>Where study depth falls off</h2></div><Link href="/admin/app-content">Manage pathways</Link></div>
        {pathwayFunnel.length ? <div className="study-table-wrap"><table className="admin-table study-table"><thead><tr><th>Pathway</th><th>Starts</th><th>25%</th><th>50%</th><th>75%</th><th>Complete</th><th>Rate</th></tr></thead><tbody>{pathwayFunnel.map((row) => <tr key={row.slug}><td><Link href={`/pathways/${row.slug}`}>{row.title}</Link><small>{row.averageProgress}% average observed depth</small></td><td><strong>{row.starts}</strong></td><td><strong>{row.reach25}</strong><small>{percent(row.reach25, row.starts)}</small></td><td><strong>{row.reach50}</strong><small>{percent(row.reach50, row.starts)}</small></td><td><strong>{row.reach75}</strong><small>{percent(row.reach75, row.starts)}</small></td><td><strong>{row.completions}</strong></td><td><strong>{row.completionRate}%</strong></td></tr>)}</tbody></table></div> : <p>No Pathway funnel activity yet.</p>}
      </section>

      <section className="admin-card">
        <div className="study-intelligence-card-head"><div><span className="section-kicker">Acquisition</span><h2>Which traffic actually studies?</h2></div><span className="admin-muted">First-touch source, last 7 days</span></div>
        {snapshot.v2.acquisition.length ? <div className="study-table-wrap"><table className="admin-table study-table"><thead><tr><th>Source</th><th>Sessions</th><th>Engaged</th><th>Study rate</th><th>Completed</th><th>App</th><th>App rate</th></tr></thead><tbody>{snapshot.v2.acquisition.map((row) => <tr key={row.source}><td><strong>{row.source}</strong></td><td><strong>{row.sessions}</strong></td><td><strong>{row.engagedSessions}</strong></td><td><strong>{row.studyRate}%</strong></td><td><strong>{row.completionSessions}</strong><small>{row.completionRate}% rate</small></td><td><strong>{row.appSessions}</strong></td><td><strong>{row.appRate}%</strong></td></tr>)}</tbody></table></div> : <p>No public acquisition data yet.</p>}
      </section>

      <div className="analytics-operations-grid">
        <section className="admin-card">
          <span className="section-kicker">Search quality</span>
          <h2>Did search lead somewhere?</h2>
          <table className="admin-table"><tbody>
            <tr><td>Search sessions</td><td><strong>{decisions.search_sessions}</strong></td></tr>
            <tr><td>Sessions opening a result</td><td><strong>{decisions.search_success_sessions}</strong></td></tr>
            <tr><td>Search success rate</td><td><strong>{decisions.search_success_rate}%</strong></td></tr>
            <tr><td>No-result sessions</td><td><strong>{decisions.search_no_result_sessions}</strong></td></tr>
            <tr><td>Result opens</td><td><strong>{decisions.search_result_opens}</strong></td></tr>
          </tbody></table>
          <p className="admin-muted">Success means the session opened at least one tracked search result. It does not treat every keystroke query as a separate successful search.</p>
        </section>

        <section className="admin-card">
          <span className="section-kicker">Public traffic</span>
          <h2>Clean visitor totals</h2>
          <table className="admin-table"><tbody>
            <tr><td>Public page views</td><td><strong>{decisions.public_page_views}</strong></td></tr>
            <tr><td>Public visitors</td><td><strong>{decisions.public_unique_browsers}</strong></td></tr>
            <tr><td>Public sessions</td><td><strong>{decisions.public_browser_sessions}</strong></td></tr>
            <tr><td>Known returning browsers</td><td><strong>{decisions.returning_browsers}</strong></td></tr>
            <tr><td>Known internal sessions excluded, 7 days</td><td><strong>{decisions.weekly_internal_sessions}</strong></td></tr>
          </tbody></table>
        </section>
      </div>

      <section className="study-intelligence-block">
        <div className="studio-section-head study-intelligence-heading"><div><span className="section-kicker">Study detail</span><h2>Reading and audio intelligence</h2></div><p>These tables keep the deeper per-content diagnostics behind the operating metrics above.</p></div>
        <div className="study-intelligence-grid">
          <section className="admin-card study-intelligence-card">
            <div className="study-intelligence-card-head"><div><span className="section-kicker">Pathways</span><h3>Pathway depth</h3></div><Link href="/admin/app-content">Manage pathways</Link></div>
            {pathwayIntelligence.length ? <div className="study-table-wrap"><table className="admin-table study-table"><thead><tr><th>Pathway</th><th>Starts</th><th>Avg. depth</th><th>Completed</th><th>Audio</th><th>Known</th><th>App</th></tr></thead><tbody>{pathwayIntelligence.map((row) => <tr key={row.slug}><td><Link href={`/pathways/${row.slug}`}>{row.title}</Link><small>{row.observedSteps} observed reading steps · {row.uniqueSessions} study sessions</small></td><td><strong>{row.starts}</strong><small>{row.audioStarts} audio starts</small></td><td><strong>{row.averageProgress}%</strong></td><td><strong>{row.completions}</strong><small>{row.completionRate}% rate · {row.readingCompletions} reading</small></td><td><strong>{row.audioCompletions}</strong></td><td><strong>{row.knownCompleters}</strong></td><td><strong>{row.appTransitions}</strong></td></tr>)}</tbody></table></div> : <div className="studio-empty-state"><strong>No Pathway study depth yet</strong><p>Reading and audio progress begin collecting as visitors meaningfully study a Pathway.</p></div>}
          </section>

          <section className="admin-card study-intelligence-card">
            <div className="study-intelligence-card-head"><div><span className="section-kicker">Articles</span><h3>Article depth</h3></div><Link href="/admin/content">Manage articles</Link></div>
            {articleIntelligence.length ? <div className="study-table-wrap"><table className="admin-table study-table"><thead><tr><th>Article</th><th>Opens</th><th>Completed</th><th>Rate</th><th>App</th></tr></thead><tbody>{articleIntelligence.map((row) => <tr key={row.slug}><td><Link href={`/articles/${row.slug}`}>{row.title}</Link><small>{row.uniqueSessions} reading sessions</small></td><td><strong>{row.opens}</strong></td><td><strong>{row.completions}</strong></td><td><strong>{row.completionRate}%</strong></td><td><strong>{row.appTransitions}</strong></td></tr>)}</tbody></table></div> : <div className="studio-empty-state"><strong>No article depth yet</strong><p>Article opens and meaningful completions will appear here.</p></div>}
          </section>
        </div>
      </section>

      <div className="analytics-operations-grid">
        <section className="admin-card">
          <h2>Live presence</h2>
          <table className="admin-table"><tbody>
            <tr><td>Public browsers online</td><td><strong>{decisions.public_active_browsers}</strong></td></tr>
            <tr><td>Public active sessions</td><td><strong>{decisions.public_active_sessions}</strong></td></tr>
            <tr><td>Presence window</td><td><strong>Last 75 seconds</strong></td></tr>
            <tr><td>Dashboard refresh</td><td><strong>Every 15 seconds</strong></td></tr>
          </tbody></table>
        </section>

        <section className="admin-card">
          <h2>Tracker health</h2>
          <table className="admin-table"><tbody>
            <tr><td>Raw events stored</td><td><strong>{metrics.total_events}</strong></td></tr>
            <tr><td>Raw browser identities</td><td><strong>{metrics.unique_browsers}</strong></td></tr>
            <tr><td>Tracking started</td><td><strong>{metrics.first_event ? new Date(metrics.first_event).toLocaleString() : "No events received"}</strong></td></tr>
            <tr><td>Latest event</td><td><strong>{metrics.latest_event ? new Date(metrics.latest_event).toLocaleString() : "No events received"}</strong></td></tr>
            <tr><td>Reporting mode</td><td><strong>Exact ledger aggregates</strong></td></tr>
            <tr><td>Baseline age</td><td><strong>{decisions.tracking_days} days</strong></td></tr>
          </tbody></table>
        </section>
      </div>

      <div className="analytics-grid">
        <MetricTable title="Top traffic sources" rows={snapshot.trafficSources} empty="No referrer or campaign data yet." />
        <MetricTable title="Most used pages" rows={snapshot.topPages} empty="No page activity yet." />
        <MetricTable title="Countries" rows={snapshot.countries} empty="No location data yet." />
        <MetricTable title="Cities / regions" rows={snapshot.cities} empty="No city data yet." />
        <MetricTable title="Devices" rows={snapshot.devices} empty="No device data yet." />
        <MetricTable title="Browsers" rows={snapshot.browsers} empty="No browser data yet." />
        <MetricTable title="Operating systems" rows={snapshot.operatingSystems} empty="No OS data yet." />
        <MetricTable title="Campaigns" rows={snapshot.campaigns} empty="No UTM campaign traffic yet." />
        <MetricTable title="UTM mediums" rows={snapshot.mediums} empty="No UTM medium traffic yet." />
        <MetricTable title="Top searches" rows={snapshot.searches} empty="No searches yet." />
        <MetricTable title="Content gaps" rows={snapshot.missingSearches} empty="No missing-result searches yet." />
        <MetricTable title="App conversion origins" rows={snapshot.appOrigins} empty="No app transitions yet." />
      </div>
    </>
  );
}

function MetricTable({ title, rows, empty }: { title: string; rows: MetricRow[]; empty: string }) {
  return (
    <section className="admin-card">
      <h2>{title}</h2>
      {rows.length ? <table className="admin-table"><tbody>{rows.map(([label, value]) => <tr key={label}><td>{label}</td><td><strong>{value}</strong></td></tr>)}</tbody></table> : <p>{empty}</p>}
    </section>
  );
}
