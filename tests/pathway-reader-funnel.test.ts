import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildPathwayReaderFunnels,
  diagnosePathwayReaderFunnel,
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

test("known Studio and Vercel preview sessions are excluded using the V3 internal-referrer rule", () => {
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
  assert.match(page, /current Pathway step order/);
  assert.doesNotMatch(page, /database-side reader funnel migration/);
  assert.match(server, /pathway_step_completed/);
  assert.match(server, /app_link_clicked/);
  assert.match(server, /range\(from, to\)/);
});


test("diagnosis waits for a usable reader sample instead of overreacting to tiny counts", () => {
  const diagnosis = diagnosePathwayReaderFunnel({
    opens: 4,
    began: 4,
    completions: 0,
    largestDrop: { from: "Step 1", to: "Step 2", lost: 4, retentionRate: 0 },
    steps: [
      { stepNumber: 1, title: "One", reference: "A", reached: 4, retentionFromPrevious: 100, retentionFromOpen: 100 },
      { stepNumber: 2, title: "Two", reference: "B", reached: 0, retentionFromPrevious: 0, retentionFromOpen: 0 }
    ]
  });
  assert.equal(diagnosis.kind, "collecting");
  assert.equal(diagnosis.review, false);
});

test("diagnosis distinguishes entry, early, mid-path, finish, and healthy patterns", () => {
  const step = (stepNumber: number, reached: number) => ({
    stepNumber, title: String(stepNumber), reference: String(stepNumber), reached,
    retentionFromPrevious: 100, retentionFromOpen: 100
  });

  assert.equal(diagnosePathwayReaderFunnel({
    opens: 10, began: 6, completions: 5, steps: [step(1, 6), step(2, 5)],
    largestDrop: { from: "Opened", to: "Step 1", lost: 4, retentionRate: 60 }
  }).kind, "entry");

  assert.equal(diagnosePathwayReaderFunnel({
    opens: 10, began: 10, completions: 5, steps: [step(1, 10), step(2, 6), step(3, 5)],
    largestDrop: { from: "Step 1", to: "Step 2", lost: 4, retentionRate: 60 }
  }).kind, "early");

  assert.equal(diagnosePathwayReaderFunnel({
    opens: 10, began: 10, completions: 5, steps: [step(1, 10), step(2, 10), step(3, 6), step(4, 5)],
    largestDrop: { from: "Step 2", to: "Step 3", lost: 4, retentionRate: 60 }
  }).kind, "mid");

  assert.equal(diagnosePathwayReaderFunnel({
    opens: 10, began: 10, completions: 5, steps: [step(1, 10), step(2, 10), step(3, 10)],
    largestDrop: { from: "Opened", to: "Step 1", lost: 0, retentionRate: 100 }
  }).kind, "finish");

  assert.equal(diagnosePathwayReaderFunnel({
    opens: 10, began: 10, completions: 8, steps: [step(1, 10), step(2, 9), step(3, 8)],
    largestDrop: { from: "Step 1", to: "Step 2", lost: 1, retentionRate: 90 }
  }).kind, "healthy");
});

test("Analytics mounts a conservative Needs Review decision layer", () => {
  const page = readFileSync("app/admin/analytics/page.tsx", "utf8");
  assert.match(page, /NEEDS REVIEW/);
  assert.match(page, /Five readers can surface a usable warning/);
  assert.match(page, /row\.diagnosis\.label/);
  assert.match(page, /Inspect Pathway/);
});


test("five starters can expose a later compound decline after the cohort shrinks", () => {
  const step = (stepNumber: number, reached: number) => ({ stepNumber, title: String(stepNumber), reference: String(stepNumber), reached, retentionFromPrevious: 100, retentionFromOpen: 100 });
  const diagnosis = diagnosePathwayReaderFunnel({
    opens: 5, began: 5, completions: 1,
    steps: [step(1, 5), step(2, 4), step(3, 4), step(4, 2), step(5, 1), step(6, 1)],
    largestDrop: { from: "Step 3", to: "Step 4", lost: 2, retentionRate: 50 }
  });
  assert.equal(diagnosis.kind, "mid");
  assert.equal(diagnosis.review, true);
  assert.equal(diagnosis.label, "Mid-path compound decline");
  assert.equal(diagnosis.focusFrom, "Step 3");
  assert.equal(diagnosis.focusTo, "Step 5");
});

test("a single later collapse remains reviewable once five readers began", () => {
  const step = (stepNumber: number, reached: number) => ({ stepNumber, title: String(stepNumber), reference: String(stepNumber), reached, retentionFromPrevious: 100, retentionFromOpen: 100 });
  const diagnosis = diagnosePathwayReaderFunnel({
    opens: 5, began: 5, completions: 2,
    steps: [step(1, 5), step(2, 5), step(3, 4), step(4, 2), step(5, 2)],
    largestDrop: { from: "Step 3", to: "Step 4", lost: 2, retentionRate: 50 }
  });
  assert.equal(diagnosis.kind, "mid");
  assert.equal(diagnosis.review, true);
  assert.equal(diagnosis.focusFrom, "Step 3");
  assert.equal(diagnosis.focusTo, "Step 4");
});
