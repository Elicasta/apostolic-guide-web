import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildPathwayReaderFunnels,
  publicReaderEvents,
  type PathwayReaderEvent
} from "../src/pathway-reader-funnel";

const catalog = [{
  slug: "jesus-is-god",
  title: "Jesus Is God",
  steps: [
    { title: "One", reference: "Isaiah 9:6" },
    { title: "Two", reference: "Matthew 1:23" },
    { title: "Three", reference: "John 1:1" },
    { title: "Four", reference: "2 Corinthians 5:19" }
  ]
}];

function event(
  session_id: string,
  event_name: string,
  occurred_at: string,
  properties: Record<string, unknown> = {},
  extras: Partial<PathwayReaderEvent> = {}
): PathwayReaderEvent {
  return {
    event_name,
    session_id,
    occurred_at,
    page_path: "/pathways/jesus-is-god",
    referrer_host: "www.google.com",
    utm_source: null,
    properties: { pathwaySlug: "jesus-is-god", ...properties },
    ...extras
  };
}

test("reader funnel distinguishes a Pathway open from actually beginning Step 1", () => {
  const events = [
    event("open-only", "pathway_started", "2026-10-01T10:00:00Z"),
    event("reader", "pathway_started", "2026-10-01T10:01:00Z"),
    event("reader", "pathway_step_completed", "2026-10-01T10:01:05Z", { stepNumber: 1 }),
    event("reader", "pathway_step_completed", "2026-10-01T10:01:10Z", { stepNumber: 2 })
  ];

  const [row] = buildPathwayReaderFunnels(events, catalog);
  assert.equal(row.opens, 2);
  assert.equal(row.began, 1);
  assert.equal(row.openToBeginRate, 50);
  assert.equal(row.steps[0].reached, 1);
  assert.equal(row.steps[1].reached, 1);
  assert.equal(row.steps[2].reached, 0);
});

test("reader waterfall uses furthest observed step so later reach cannot exceed earlier reach", () => {
  const events = [
    event("reader", "pathway_started", "2026-10-01T10:00:00Z"),
    event("reader", "pathway_step_completed", "2026-10-01T10:00:05Z", { stepNumber: 4 })
  ];

  const [row] = buildPathwayReaderFunnels(events, catalog);
  assert.deepEqual(row.steps.map((step) => step.reached), [1, 1, 1, 1]);
  assert.equal(row.completions, 1);
  assert.equal(row.beginToCompleteRate, 100);
});

test("audio completion does not masquerade as reading completion", () => {
  const events = [
    event("audio", "pathway_started", "2026-10-01T10:00:00Z"),
    event("audio", "pathway_completed", "2026-10-01T10:02:00Z", { completionMethod: "audio" })
  ];

  const [row] = buildPathwayReaderFunnels(events, catalog);
  assert.equal(row.opens, 1);
  assert.equal(row.began, 0);
  assert.equal(row.completions, 0);
});

test("intentional app handoff is reported separately from reading completion", () => {
  const events = [
    event("reader", "pathway_started", "2026-10-01T10:00:00Z"),
    event("reader", "pathway_step_completed", "2026-10-01T10:00:05Z", { stepNumber: 1 }),
    event("reader", "app_link_clicked", "2026-10-01T10:00:10Z", { origin: "website-pathway-jesus-is-god" })
  ];

  const [row] = buildPathwayReaderFunnels(events, catalog);
  assert.equal(row.appTransitions, 1);
  assert.equal(row.completions, 0);
});

test("known Studio and Vercel preview sessions are excluded with the same first-touch rule as Analytics V3", () => {
  const events = [
    event("internal", "pathway_started", "2026-10-01T10:00:00Z", {}, { referrer_host: "studio.apostolicguide.com" }),
    event("internal", "pathway_step_completed", "2026-10-01T10:00:05Z", { stepNumber: 1 }, { referrer_host: "studio.apostolicguide.com" }),
    event("public", "pathway_started", "2026-10-01T11:00:00Z")
  ];

  const filtered = publicReaderEvents(events);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].session_id, "public");
});

test("largest loss points to the exact transition instead of a 25/50/75 bucket", () => {
  const events = [
    event("a", "pathway_started", "2026-10-01T10:00:00Z"),
    event("b", "pathway_started", "2026-10-01T10:00:01Z"),
    event("c", "pathway_started", "2026-10-01T10:00:02Z"),
    event("a", "pathway_step_completed", "2026-10-01T10:00:03Z", { stepNumber: 4 }),
    event("b", "pathway_step_completed", "2026-10-01T10:00:04Z", { stepNumber: 2 }),
    event("c", "pathway_step_completed", "2026-10-01T10:00:05Z", { stepNumber: 2 })
  ];

  const [row] = buildPathwayReaderFunnels(events, catalog);
  assert.deepEqual(row.steps.map((step) => step.reached), [3, 3, 1, 1]);
  assert.deepEqual(row.largestDrop, {
    from: "Step 2",
    to: "Step 3",
    lost: 2,
    retentionRate: 33
  });
});

test("Analytics page labels legacy pathway_started as opens and mounts the exact reader waterfall", () => {
  const page = readFileSync("app/admin/analytics/page.tsx", "utf8");
  const server = readFileSync("src/pathway-reader-funnel-server.ts", "utf8");
  assert.match(page, /Pathway opens/);
  assert.match(page, /READER WATERFALL/);
  assert.match(page, /Largest exact loss/);
  assert.match(page, /open → Step 1/);
  assert.match(server, /pathway_step_completed/);
  assert.match(server, /app_link_clicked/);
  assert.match(server, /range\(from, to\)/);
});
