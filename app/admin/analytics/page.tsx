import { getAdminAccess } from "@/auth";
import { createServiceClient } from "@/supabase";

type EventRow = {
  event_name: string;
  page_path: string;
  properties: Record<string, unknown>;
  occurred_at: string;
};

function countBy(values: string[]) {
  return Object.entries(values.reduce<Record<string, number>>((result, value) => {
    if (value) result[value] = (result[value] ?? 0) + 1;
    return result;
  }, {})).sort((a, b) => b[1] - a[1]);
}

export default async function AdminAnalyticsPage() {
  const access = await getAdminAccess();
  const service = access.state === "allowed" ? createServiceClient() : null;
  let events: EventRow[] = [];
  if (service) {
    const result = await service.schema("analytics").from("events")
      .select("event_name,page_path,properties,occurred_at")
      .order("occurred_at", { ascending: false })
      .limit(5000);
    events = result.data ?? [];
  }

  const eventCounts = countBy(events.map((event) => event.event_name));
  const topPages = countBy(events.filter((event) => event.event_name === "page_viewed").map((event) => event.page_path)).slice(0, 10);
  const searches = countBy(events.filter((event) => event.event_name === "search_submitted").map((event) => String(event.properties?.query ?? ""))).slice(0, 10);
  const missing = countBy(events.filter((event) => event.event_name === "search_no_results").map((event) => String(event.properties?.query ?? ""))).slice(0, 10);
  const appOrigins = countBy(events.filter((event) => event.event_name === "app_link_clicked").map((event) => String(event.properties?.origin ?? event.properties?.placement ?? event.page_path))).slice(0, 10);
  const count = (name: string) => eventCounts.find(([key]) => key === name)?.[1] ?? 0;

  return (
    <>
      <span className="eyebrow">Product intelligence</span>
      <h1>Analytics</h1>
      <p className="admin-lede">Measure what people search, read, share, and carry into the app. Private study content is excluded.</p>
      <div className="metric-grid">
        <div className="metric"><strong>{count("page_viewed")}</strong><span>Page views sampled</span></div>
        <div className="metric"><strong>{count("search_submitted")}</strong><span>Searches submitted</span></div>
        <div className="metric"><strong>{count("search_no_results")}</strong><span>Missing-result searches</span></div>
        <div className="metric"><strong>{count("app_link_clicked")}</strong><span>App transitions</span></div>
      </div>
      <div className="analytics-grid">
        <MetricTable title="Most used pages" rows={topPages} empty="No page activity yet." />
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
