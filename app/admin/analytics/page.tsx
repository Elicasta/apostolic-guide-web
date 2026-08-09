import { getAdminAccess } from "@/auth";
import { createServiceClient } from "@/supabase";
import { AdminLiveMetrics } from "@/admin-live-metrics";

type EventRow = {
  event_name: string;
  page_path: string;
  referrer_host: string | null;
  source: string;
  device_class: string;
  country_code: string | null;
  region: string | null;
  city: string | null;
  browser: string | null;
  os: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  properties: Record<string, unknown>;
  session_id: string;
  anonymous_id: string;
  occurred_at: string;
};

function countBy(values: string[]) {
  return Object.entries(values.reduce<Record<string, number>>((result, value) => {
    if (value) result[value] = (result[value] ?? 0) + 1;
    return result;
  }, {})).sort((a, b) => b[1] - a[1]);
}

function percent(part: number, total: number) {
  return total ? `${Math.round((part / total) * 100)}%` : "0%";
}

function sourceLabel(event: EventRow) {
  if (event.utm_source) return event.utm_source;
  if (event.referrer_host) return event.referrer_host.replace(/^www\./, "");
  return "Direct / unknown";
}

export default async function AdminAnalyticsPage() {
  const access = await getAdminAccess();
  const service = access.state === "allowed" ? createServiceClient() : null;
  let events: EventRow[] = [];
  let subscriberCount = 0;
  let loadError = "";

  if (service) {
    const [eventsResult, subscribersResult] = await Promise.all([
      service.schema("analytics").from("events")
        .select("event_name,page_path,referrer_host,source,device_class,country_code,region,city,browser,os,utm_source,utm_medium,utm_campaign,properties,session_id,anonymous_id,occurred_at")
        .order("occurred_at", { ascending: false })
        .limit(10000),
      service.from("email_subscribers")
        .select("id", { head: true, count: "exact" })
        .eq("status", "subscribed")
    ]);

    events = eventsResult.data ?? [];
    subscriberCount = subscribersResult.count ?? 0;
    if (eventsResult.error) loadError = `${eventsResult.error.code}: ${eventsResult.error.message}`;
    if (subscribersResult.error && !loadError) loadError = `${subscribersResult.error.code}: ${subscribersResult.error.message}`;
  } else if (access.state === "allowed") {
    loadError = "Supabase service credentials are not configured in this environment.";
  }

  const pageViews = events.filter((event) => event.event_name === "page_viewed");
  const eventCounts = countBy(events.map((event) => event.event_name));
  const onlineCutoff = Date.now() - 75_000;
  const activeVisitors = new Set(
    events
      .filter((event) => event.event_name === "presence_heartbeat" && new Date(event.occurred_at).getTime() >= onlineCutoff)
      .map((event) => event.anonymous_id)
  ).size;
  const activeSessions = new Set(
    events
      .filter((event) => event.event_name === "presence_heartbeat" && new Date(event.occurred_at).getTime() >= onlineCutoff)
      .map((event) => event.session_id)
  ).size;

  const topPages = countBy(pageViews.map((event) => event.page_path.split("?")[0])).slice(0, 12);
  const searches = countBy(events.filter((event) => event.event_name === "search_submitted").map((event) => String(event.properties?.query ?? ""))).slice(0, 12);
  const missing = countBy(events.filter((event) => event.event_name === "search_no_results").map((event) => String(event.properties?.query ?? ""))).slice(0, 12);
  const appOrigins = countBy(events.filter((event) => event.event_name === "app_link_clicked").map((event) => String(event.properties?.origin ?? event.properties?.placement ?? event.page_path))).slice(0, 12);
  const trafficSources = countBy(pageViews.map(sourceLabel)).slice(0, 12);
  const devices = countBy(pageViews.map((event) => event.device_class)).slice(0, 8);
  const countries = countBy(pageViews.map((event) => event.country_code ?? "Unknown")).slice(0, 12);
  const cities = countBy(pageViews.map((event) => [event.city, event.region, event.country_code].filter(Boolean).join(", ") || "Unknown")).slice(0, 12);
  const browsers = countBy(pageViews.map((event) => event.browser ?? "Unknown")).slice(0, 8);
  const operatingSystems = countBy(pageViews.map((event) => event.os ?? "Unknown")).slice(0, 8);
  const campaigns = countBy(pageViews.map((event) => event.utm_campaign ?? "").filter(Boolean)).slice(0, 12);
  const mediums = countBy(pageViews.map((event) => event.utm_medium ?? "").filter(Boolean)).slice(0, 12);
  const uniqueSessions = new Set(pageViews.map((event) => event.session_id)).size;
  const uniqueVisitors = new Set(pageViews.map((event) => event.anonymous_id)).size;
  const appTransitions = eventCounts.find(([key]) => key === "app_link_clicked")?.[1] ?? 0;
  const searchCount = eventCounts.find(([key]) => key === "search_submitted")?.[1] ?? 0;
  const missingCount = eventCounts.find(([key]) => key === "search_no_results")?.[1] ?? 0;
  const completedReads = eventCounts.find(([key]) => key === "article_completed")?.[1] ?? 0;
  const lastEvent = events[0]?.occurred_at;

  return (
    <>
      <AdminLiveMetrics />
      <span className="eyebrow">Product intelligence</span>
      <h1>Analytics</h1>
      <p className="admin-lede">Live first-party usage data from the website. Track visits, discovery, search behavior, location, devices, campaigns, and movement into the app.</p>

      {loadError ? <section className="admin-card"><h2>Tracker status</h2><p><strong>Analytics is not writing yet.</strong></p><p>{loadError}</p><p>Apply the Supabase analytics migrations and confirm the production Supabase service key is configured.</p></section> : null}

      <div className="metric-grid">
        <div className="metric"><strong>{activeVisitors}</strong><span>Live now</span></div>
        <div className="metric"><strong>{subscriberCount}</strong><span>Subscribers</span></div>
        <div className="metric"><strong>{pageViews.length}</strong><span>Page views</span></div>
        <div className="metric"><strong>{uniqueVisitors}</strong><span>Unique visitors</span></div>
        <div className="metric"><strong>{uniqueSessions}</strong><span>Sessions</span></div>
        <div className="metric"><strong>{appTransitions}</strong><span>App transitions</span></div>
        <div className="metric"><strong>{searchCount}</strong><span>Searches</span></div>
        <div className="metric"><strong>{missingCount}</strong><span>Missing-result searches</span></div>
        <div className="metric"><strong>{completedReads}</strong><span>Completed article reads</span></div>
        <div className="metric"><strong>{percent(appTransitions, uniqueSessions)}</strong><span>Session → app rate</span></div>
      </div>

      <section className="admin-card">
        <h2>Live presence</h2>
        <table className="admin-table"><tbody>
          <tr><td>People online</td><td><strong>{activeVisitors}</strong></td></tr>
          <tr><td>Active browser sessions</td><td><strong>{activeSessions}</strong></td></tr>
          <tr><td>Presence window</td><td><strong>Last 75 seconds</strong></td></tr>
          <tr><td>Dashboard refresh</td><td><strong>Every 15 seconds</strong></td></tr>
        </tbody></table>
      </section>

      <section className="admin-card">
        <h2>Tracker health</h2>
        <table className="admin-table"><tbody>
          <tr><td>Events stored</td><td><strong>{events.length}</strong></td></tr>
          <tr><td>Latest event</td><td><strong>{lastEvent ? new Date(lastEvent).toLocaleString() : "No events received"}</strong></td></tr>
          <tr><td>Event source</td><td><strong>First-party / Supabase</strong></td></tr>
          <tr><td>Private study content</td><td><strong>Excluded</strong></td></tr>
        </tbody></table>
      </section>

      <div className="analytics-grid">
        <MetricTable title="Top traffic sources" rows={trafficSources} empty="No referrer or campaign data yet." />
        <MetricTable title="Most used pages" rows={topPages} empty="No page activity yet." />
        <MetricTable title="Countries" rows={countries} empty="No location data yet." />
        <MetricTable title="Cities / regions" rows={cities} empty="No city data yet." />
        <MetricTable title="Devices" rows={devices} empty="No device data yet." />
        <MetricTable title="Browsers" rows={browsers} empty="No browser data yet." />
        <MetricTable title="Operating systems" rows={operatingSystems} empty="No OS data yet." />
        <MetricTable title="Campaigns" rows={campaigns} empty="No UTM campaign traffic yet." />
        <MetricTable title="UTM mediums" rows={mediums} empty="No UTM medium traffic yet." />
        <MetricTable title="Top searches" rows={searches} empty="No searches yet." />
        <MetricTable title="Content gaps" rows={missing} empty="No missing-result searches yet." />
        <MetricTable title="App conversion origins" rows={appOrigins} empty="No app transitions yet." />
      </div>
    </>
  );
}

function MetricTable({ title, rows, empty }: { title: string; rows: [string, number][]; empty: string }) {
  return (
    <section className="admin-card">
      <h2>{title}</h2>
      {rows.length ? <table className="admin-table"><tbody>{rows.map(([label, value]) => <tr key={label}><td>{label}</td><td><strong>{value}</strong></td></tr>)}</tbody></table> : <p>{empty}</p>}
    </section>
  );
}
