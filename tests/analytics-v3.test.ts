import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  analyticsConfidence,
  analyticsRate,
  buildAnalyticsV3Signals,
  compareAnalyticsMetric,
  formatAnalyticsComparison,
  rollupPathwayCollections,
  type AnalyticsV3Snapshot
} from "../src/analytics-v3";

function snapshot(): AnalyticsV3Snapshot {
  return {
    schemaVersion: 3,
    generatedAt: "2026-08-31T22:00:00.000Z",
    period: {
      currentStart: "2026-08-24T22:00:00.000Z",
      currentEnd: "2026-08-31T22:00:00.000Z",
      previousStart: "2026-08-17T22:00:00.000Z",
      previousEnd: "2026-08-24T22:00:00.000Z",
      trackingDays: 30,
      trendReady: true,
      current: { pageViews: 420, visitors: 190, sessions: 230, newVisitors: 150, returningVisitors: 40, engagedStudySessions: 7, pathwayStartSessions: 16, pathwayCompletionSessions: 4, appTransitionSessions: 5, searchSessions: 20, noResultSearchSessions: 4 },
      previous: { pageViews: 300, visitors: 142, sessions: 180, newVisitors: 120, returningVisitors: 22, engagedStudySessions: 2, pathwayStartSessions: 10, pathwayCompletionSessions: 2, appTransitionSessions: 2, searchSessions: 12, noResultSearchSessions: 2 }
    },
    acquisition: [
      { source: "Instagram", sessions: 80, priorSessions: 40, engagedSessions: 8, completionSessions: 3, appSessions: 4, studyRate: 10, completionRate: 4, appRate: 5 },
      { source: "Google", sessions: 50, priorSessions: 45, engagedSessions: 9, completionSessions: 5, appSessions: 2, studyRate: 18, completionRate: 10, appRate: 4 }
    ],
    pathways: [
      { slug: "god-is-one", starts: 22, reach25: 15, reach50: 9, reach75: 4, completions: 2, completionRate: 9, averageProgress: 29, priorStarts: 14, priorCompletions: 3 },
      { slug: "faith-grace-and-obedience", starts: 6, reach25: 6, reach50: 5, reach75: 4, completions: 4, completionRate: 67, averageProgress: 84, priorStarts: 2, priorCompletions: 1 }
    ],
    daily: [], devices: [], countries: [],
    searches: [{ query: "john 17", count: 8 }],
    searchGaps: [{ query: "john 17 glory", count: 3 }],
    topPages: [], campaigns: [], internalSessionsExcluded: 4
  };
}

test("Analytics V3 comparison always exposes exact numerator values with the percentage", () => {
  const comparison = compareAnalyticsMetric(7, 2);
  assert.deepEqual(comparison, { current: 7, previous: 2, absolute: 5, percent: 250, direction: "up" });
  assert.equal(formatAnalyticsComparison(comparison), "7 vs 2 · +5 · +250%");
  assert.equal(formatAnalyticsComparison(compareAnalyticsMetric(4, 0)), "4 vs 0 · new activity");
});

test("Analytics V3 rates cannot exceed 100 and confidence resists tiny-sample hype", () => {
  assert.equal(analyticsRate(3, 16), 19);
  assert.equal(analyticsRate(20, 10), 100);
  assert.equal(analyticsConfidence(6), "early");
  assert.equal(analyticsConfidence(22), "moderate");
  assert.equal(analyticsConfidence(90), "strong");
});

test("Pathway collection rollups use weighted depth and exact completions", () => {
  const rows = [
    { ...snapshot().pathways[0], title: "God Is One", collection: "One God and divine identity" },
    { ...snapshot().pathways[1], title: "Faith, Grace, and Obedience", collection: "Questions and biblical interpretation" }
  ];
  const rollups = rollupPathwayCollections(rows);
  assert.equal(rollups.length, 2);
  const oneGod = rollups.find((row) => row.collection === "One God and divine identity");
  assert.equal(oneGod?.starts, 22);
  assert.equal(oneGod?.completions, 2);
  assert.equal(oneGod?.completionRate, 9);
  assert.equal(oneGod?.weightedAverageProgress, 29);
});

test("decision rules surface traffic growth, study movement, source growth, drop-off, deep content, and search gaps", () => {
  const data = snapshot();
  const rows = [
    { ...data.pathways[0], title: "God Is One", collection: "One God and divine identity" },
    { ...data.pathways[1], title: "Faith, Grace, and Obedience", collection: "Questions and biblical interpretation" }
  ];
  const signals = buildAnalyticsV3Signals(data, rows);
  const ids = signals.map((item) => item.id);
  assert.ok(ids.includes("traffic-change"));
  assert.ok(ids.includes("study-change"));
  assert.ok(ids.some((id) => id.startsWith("source-growth:Instagram")));
  assert.ok(ids.some((id) => id.startsWith("pathway-dropoff:god-is-one")));
  assert.ok(ids.some((id) => id.startsWith("pathway-opportunity:faith-grace-and-obedience")));
  assert.ok(ids.some((id) => id.startsWith("search-gap:john 17 glory")));
  assert.equal(signals.find((item) => item.id === "study-change")?.confidence, "early");
});

test("Sol is no longer mounted globally and Analytics V3 invokes it deliberately", () => {
  const layout = readFileSync("app/admin/layout.tsx", "utf8");
  const page = readFileSync("app/admin/analytics/page.tsx", "utf8");
  const route = readFileSync("app/api/admin/analytics/interpret/route.ts", "utf8");
  assert.doesNotMatch(layout, /SolManagerSidecar/);
  assert.match(page, /AnalyticsSolBrief/);
  assert.match(route, /deterministicSourceOfTruth: true/);
  assert.match(route, /mayInventMetrics: false/);
  assert.match(route, /rawSearchTextIncluded: false/);
});

test("Google Search Console adapter is optional and server-only", () => {
  const google = readFileSync("src/google-search-console.ts", "utf8");
  const env = readFileSync(".env.example", "utf8");
  assert.match(google, /import "server-only"/);
  assert.match(google, /webmasters\.readonly/);
  assert.match(google, /GOOGLE_SEARCH_CONSOLE_SITE_URL/);
  assert.match(google, /GOOGLE_SERVICE_ACCOUNT_EMAIL/);
  assert.match(google, /GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY/);
  assert.match(google, /currentEnd\.setUTCDate\(currentEnd\.getUTCDate\(\) - 2\)/);
  assert.match(env, /GOOGLE_SEARCH_CONSOLE_SITE_URL=/);
  assert.doesNotMatch(env, /NEXT_PUBLIC_GOOGLE_SERVICE_ACCOUNT/);
});
