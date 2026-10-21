import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Pathways are the first home section and primary call to action", () => {
  const home = read("app/page.tsx");
  assert.ok(home.indexOf('className="ei-pathway"') < home.indexOf('className="ei-search"'));
  assert.ok(home.indexOf('className="ei-pathway"') < home.indexOf('<AppPromoBanner />'));
  assert.match(home, /data-study-entry="home-hero".*?href="\/pathways\/god-is-one#step-1"/);
  assert.match(home, /Start guided Bible study/);
  const header = read("src/components.tsx");
  assert.ok(header.indexOf('["Pathways", "/pathways"]') < header.indexOf('["Topics", "/topics"]'));
});

test("new card reader controls record actual navigation method, not hash changes", () => {
  const reader = read("src/pathway-card-reader.tsx");
  assert.match(reader, /pathway_step_navigated/);
  for (const method of ["arrow","keyboard","swipe","step_list"]) {
    assert.ok(reader.includes(`method: "${method}"`), `missing ${method} method`);
  }
  assert.match(reader, /clamped !== active && options\.method/);
  const tracker = read("src/pathway-study-tracker.tsx");
  assert.match(tracker, /pathway_step_viewed/);
  assert.match(tracker, /pathway_step_completed/);
  const route = read("app/api/analytics/events/route.ts");
  assert.match(route, /"pathway_step_navigated"/);
  assert.match(route, /"pathway_entry_clicked"/);
});

test("Analytics V3 migration works with the actual production event schema", () => {
  const sql = read("supabase/migrations/202608310001_analytics_v3_decision_system.sql");
  assert.match(sql, /nullif\(device_class, ''\)/);
  assert.match(sql, /nullif\(country_code, ''\)/);
  assert.doesNotMatch(sql, /nullif\(device_type, ''\)|nullif\(country, ''\)/);
  assert.match(sql, /revoke all on function analytics\.dashboard_snapshot_v3\(\) from public, anon, authenticated/);
});

test("GA4 optional mirroring does not fire automatic hash-navigation pageviews or expose server keys", () => {
  const tag = read("src/google-analytics4.tsx");
  const analytics = read("src/analytics.tsx");
  assert.match(tag, /NEXT_PUBLIC_GA4_MEASUREMENT_ID/);
  assert.match(tag, /send_page_view: false/);
  assert.match(tag, /navigator\.doNotTrack/);
  assert.match(analytics, /gtag\("event", "pathway_navigation"/);
  assert.doesNotMatch(tag, /SERVICE_ROLE|PRIVATE_KEY|search_term/);
});

test("Search Console property-level totals are queried separately from privacy-filtered terms",()=>{
  const gsc = read("src/google-search-console.ts");
  assert.match(gsc, /dimensions: \[\], aggregationType: "byProperty"/);
  assert.match(gsc, /dimensions: \["query", "page"\]/);
  assert.match(gsc, /summarizePeriod\(startDate, endDate, rows, totals\.rows\?\.\[0\]\)/);
});

test("Pathways expose crawlable schema with canonical URL and guided steps",()=>{
  const index = read("app/pathways/page.tsx");
  const detail = read("app/pathways/[slug]/page.tsx");
  assert.match(index, /"@type": "CollectionPage"/);
  assert.match(index, /"@type": "ItemList"/);
  assert.match(detail, /"@type": "LearningResource"/);
  assert.match(detail, /"@type": "CreativeWork"/);
  assert.match(detail, /breadcrumbJsonLd/);
  assert.match(detail, /buildSeoMetadata/);
});
