import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function source(path: string) {
  return readFileSync(path, "utf8");
}

test("analytics dashboard uses exact V2 database aggregates instead of a capped event sample", () => {
  const page = source("app/admin/analytics/page.tsx");
  assert.match(page, /schema\("analytics"\)\.rpc\("dashboard_snapshot_v2"\)/);
  assert.doesNotMatch(page, /limit\(10000\)/);
  assert.match(page, /decisions\.weekly_engaged_study_sessions/);
  assert.match(page, /decisions\.public_unique_browsers/);
  assert.match(page, /decisions\.weekly_app_transition_sessions/);
});

test("analytics dashboard excludes retired pathway and article slugs from current-content tables", () => {
  const page = source("app/admin/analytics/page.tsx");
  assert.match(page, /snapshot\.pathways\s*\.filter\(\(row\) => pathwayTitles\.has\(row\.slug\)\)/);
  assert.match(page, /snapshot\.v2\.pathwayFunnel\s*\.filter\(\(row\) => pathwayTitles\.has\(row\.slug\)\)/);
  assert.match(page, /snapshot\.articles\s*\.filter\(\(row\) => articleTitles\.has\(row\.slug\)\)/);
});

test("analytics reporting migration calculates visitor, session, live, and study metrics from the full ledger", () => {
  const migration = source("supabase/migrations/202608190001_analytics_accuracy_hardening.sql");
  assert.match(migration, /create or replace function analytics\.dashboard_snapshot\(\)/i);
  assert.match(migration, /count\(distinct anonymous_id\).*event_name = 'page_viewed'/is);
  assert.match(migration, /count\(distinct session_id\).*event_name = 'page_viewed'/is);
  assert.match(migration, /occurred_at >= now\(\) - interval '75 seconds'/i);
  assert.match(migration, /pathway_rows_final/);
  assert.match(migration, /article_rows_final/);
  assert.match(migration, /grant execute on function analytics\.dashboard_snapshot\(\) to service_role/i);
});

test("Analytics V2 defines a strict engaged-study metric, Pathway funnel, retention cohorts, and source conversion", () => {
  const migration = source("supabase/migrations/202608190002_analytics_v2_decision_metrics.sql");
  assert.match(migration, /create or replace function analytics\.dashboard_snapshot_v2\(\)/i);
  assert.match(migration, /pathway_step_completed.*pathway_completed.*article_completed.*audio_completed/is);
  assert.match(migration, /audio_progress.*listened_seconds.*>= 30/is);
  assert.match(migration, /pathway_funnel/);
  assert.match(migration, /seven_day_return_rate/);
  assert.match(migration, /thirty_day_return_rate/);
  assert.match(migration, /study_rate/);
  assert.match(migration, /app_rate/);
  assert.match(migration, /grant execute on function analytics\.dashboard_snapshot_v2\(\) to service_role/i);
});

test("Analytics V2 separates known Studio and preview traffic from public traffic", () => {
  const publicTraffic = source("supabase/migrations/202608190003_analytics_v2_public_traffic.sql");
  const nullFix = source("supabase/migrations/202608190004_analytics_v2_internal_null_fix.sql");
  const liveMetrics = source("supabase/migrations/202608190005_analytics_v2_public_live_metrics.sql");
  assert.match(publicTraffic, /Internal \/ Studio/);
  assert.match(publicTraffic, /elicastas-projects\.vercel\.app/);
  assert.match(nullFix, /coalesce\([\s\S]*is_internal/);
  assert.match(liveMetrics, /public_page_views/);
  assert.match(liveMetrics, /public_active_browsers/);
  assert.match(liveMetrics, /occurred_at >= now\(\) - interval '75 seconds'/i);
});

test("browser identity is shared across Apostolic Guide subdomains and any UTM field can establish attribution", () => {
  const analytics = source("src/analytics.tsx");
  assert.match(analytics, /cookieValue\(ANONYMOUS_KEY\)/);
  assert.match(analytics, /window\.localStorage\.setItem\(ANONYMOUS_KEY, shared\)/);
  assert.match(analytics, /Object\.values\(attribution\)\.some/);
  assert.match(analytics, /Domain=\.apostolicguide\.com/);
});

test("Pathway starts and search-result opens are instrumented for V2 funnels", () => {
  const analytics = source("src/analytics.tsx");
  const route = source("app/api/analytics/events/route.ts");
  assert.match(analytics, /if \(section === "pathways"\) return \{ name: "pathway_started"/);
  assert.match(analytics, /trackEvent\("search_result_opened"/);
  assert.match(route, /"pathway_started"/);
  assert.match(route, /"search_result_opened"/);
});

test("install guide records button and returning-user app handoffs", () => {
  const guide = source("src/app-install-guide.tsx");
  assert.match(guide, /trackEvent\("app_link_clicked", appHandoffProperties\(target, "returning-auto"\)\)/);
  assert.match(guide, /trackEvent\("app_link_clicked", appHandoffProperties\(target, "install-guide-button"\)\)/);
});

test("analytics ingestion fails visibly instead of reporting success when writes are unavailable", () => {
  const route = source("app/api/analytics/events/route.ts");
  assert.match(route, /status: 503/);
  assert.match(route, /status: 500/);
  assert.match(route, /analytics ingestion failed/);
});
