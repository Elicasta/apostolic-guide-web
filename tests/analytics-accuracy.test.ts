import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function source(path: string) {
  return readFileSync(path, "utf8");
}

test("analytics dashboard uses exact database aggregates instead of a capped event sample", () => {
  const page = source("app/admin/analytics/page.tsx");
  assert.match(page, /schema\("analytics"\)\.rpc\("dashboard_snapshot"\)/);
  assert.doesNotMatch(page, /limit\(10000\)/);
  assert.match(page, /metrics\.total_events/);
  assert.match(page, /metrics\.app_transition_sessions/);
  assert.match(page, /percent\(metrics\.app_transition_sessions, metrics\.browser_sessions\)/);
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

test("browser identity is shared across Apostolic Guide subdomains and any UTM field can establish attribution", () => {
  const analytics = source("src/analytics.tsx");
  assert.match(analytics, /cookieValue\(ANONYMOUS_KEY\)/);
  assert.match(analytics, /window\.localStorage\.setItem\(ANONYMOUS_KEY, shared\)/);
  assert.match(analytics, /Object\.values\(attribution\)\.some/);
  assert.match(analytics, /Domain=\.apostolicguide\.com/);
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
