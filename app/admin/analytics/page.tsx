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
  articles: []
};

function percent(part: number, total: number) {
  return total ? `${Math.min(100, Math.round((part / total) * 100))}%` : "0%";
}

function asSnapshot(value: unknown): AnalyticsSnapshot {
  if (!value || typeof value !== "object") return emptySnapshot;
  const snapshot = value as Partial<AnalyticsSnapshot>;
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
    articles: snapshot.articles ?? []
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
      service.schema("analytics").rpc("dashboard_snapshot"),
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
  const pathwayTitles = new Map(allPathways.map((pathway) => [pathway.slug, pathway.title]));
  const articleTitles = new Map(articles.map((article) => [article.slug, article.title]));
  const pathwayIntelligence = snapshot.pathways
    .filter((row) => pathwayTitles.has(row.slug))
    .map((row) => ({ ...row, title: pathwayTitles.get(row.slug) ?? row.slug }))
    .slice(0, 12);
  const articleIntelligence = snapshot.articles
    .filter((row) => articleTitles.has(row.slug))
    .map((row) => ({ ...row, title: articleTitles.get(row.slug) ?? row.slug }))
    .slice(0, 12);

  return (
    <>
      <AdminLiveMetrics />
      <span className="eyebrow">Product intelligence</span>
      <h1>Analytics</h1>
      <p className="admin-lede">Live first-party usage data from the website. Track visits, discovery, study activity, location, campaigns, and movement into the app.</p>
      <p className="admin-muted">Dashboard totals are computed from the complete analytics ledger, not a recent-row sample. A unique visitor here means one persistent browser identity. Sessions are browser-session IDs.</p>

      {loadError ? <section className="admin-card"><h2>Tracker status</h2><p><strong>Analytics reporting is unavailable.</strong></p><p>{loadError}</p><p>Apply the analytics accuracy migration and confirm the production Supabase service key is configured.</p></section> : null}

      <div className="metric-grid">
        <div className="metric"><strong>{metrics.active_browsers}</strong><span>Live now</span></div>
        <div className="metric"><strong>{subscriberCount}</strong><span>Subscribers</span></div>
        <div className="metric"><strong>{metrics.page_views}</strong><span>Page views</span></div>
        <div className="metric"><strong>{metrics.unique_browsers}</strong><span>Unique visitors</span></div>
        <div className="metric"><strong>{metrics.browser_sessions}</strong><span>Sessions</span></div>
        <div className="metric"><strong>{metrics.pathway_completions}</strong><span>Pathway completions</span></div>
        <div className="metric"><strong>{metrics.known_pathway_completers}</strong><span>Known completers</span></div>
        <div className="metric"><strong>{metrics.app_transition_events}</strong><span>App transitions</span></div>
        <div className="metric"><strong>{metrics.searches}</strong><span>Searches</span></div>
        <div className="metric"><strong>{metrics.missing_searches}</strong><span>Missing-result searches</span></div>
        <div className="metric"><strong>{metrics.article_completions}</strong><span>Completed article reads</span></div>
        <div className="metric"><strong>{percent(metrics.app_transition_sessions, metrics.browser_sessions)}</strong><span>Session → app rate</span></div>
      </div>

      <section className="study-intelligence-block">
        <div className="studio-section-head study-intelligence-heading"><div><span className="section-kicker">Study intelligence</span><h2>What people are actually studying</h2></div><p>A Pathway completion is recorded when someone meaningfully reaches the final study step or finishes the Pathway narration. Reading and audio are retained as separate methods while the Pathway itself is counted once per session.</p></div>
        <div className="study-intelligence-grid">
          <section className="admin-card study-intelligence-card">
            <div className="study-intelligence-card-head"><div><span className="section-kicker">Pathways</span><h3>Pathway depth</h3></div><Link href="/admin/app-content">Manage pathways</Link></div>
            {pathwayIntelligence.length ? <div className="study-table-wrap"><table className="admin-table study-table"><thead><tr><th>Pathway</th><th>Starts</th><th>Avg. depth</th><th>Completed</th><th>Audio</th><th>Known</th><th>App</th></tr></thead><tbody>{pathwayIntelligence.map((row) => <tr key={row.slug}><td><Link href={`/pathways/${row.slug}`}>{row.title}</Link><small>{row.observedSteps} observed reading steps · {row.uniqueSessions} study sessions</small></td><td><strong>{row.starts}</strong><small>{row.audioStarts} audio starts</small></td><td><strong>{row.averageProgress}%</strong></td><td><strong>{row.completions}</strong><small>{row.completionRate}% rate · {row.readingCompletions} reading</small></td><td><strong>{row.audioCompletions}</strong></td><td><strong>{row.knownCompleters}</strong></td><td><strong>{row.appTransitions}</strong></td></tr>)}</tbody></table></div> : <div className="studio-empty-state"><strong>No pathway study depth yet</strong><p>Reading and audio progress begin collecting as visitors meaningfully study a Pathway.</p></div>}
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
            <tr><td>People online</td><td><strong>{metrics.active_browsers}</strong></td></tr>
            <tr><td>Active browser sessions</td><td><strong>{metrics.active_sessions}</strong></td></tr>
            <tr><td>Presence window</td><td><strong>Last 75 seconds</strong></td></tr>
            <tr><td>Dashboard refresh</td><td><strong>Every 15 seconds</strong></td></tr>
          </tbody></table>
        </section>

        <section className="admin-card">
          <h2>Tracker health</h2>
          <table className="admin-table"><tbody>
            <tr><td>Events stored</td><td><strong>{metrics.total_events}</strong></td></tr>
            <tr><td>Tracking started</td><td><strong>{metrics.first_event ? new Date(metrics.first_event).toLocaleString() : "No events received"}</strong></td></tr>
            <tr><td>Latest event</td><td><strong>{metrics.latest_event ? new Date(metrics.latest_event).toLocaleString() : "No events received"}</strong></td></tr>
            <tr><td>Reporting mode</td><td><strong>Exact ledger aggregates</strong></td></tr>
            <tr><td>Event source</td><td><strong>First-party / Supabase</strong></td></tr>
            <tr><td>Private study content</td><td><strong>Excluded</strong></td></tr>
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
