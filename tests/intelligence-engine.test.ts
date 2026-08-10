import assert from "node:assert/strict";
import test from "node:test";
import { buildStudioIntelligence } from "../src/intelligence-engine";

const now = new Date("2026-08-10T17:00:00.000Z");
const event = (daysAgo: number, event_name: string, properties: Record<string, unknown> = {}, person_id: string | null = null, session_id = `s-${daysAgo}-${event_name}`) => ({
  event_name,
  occurred_at: new Date(now.getTime() - daysAgo * 86_400_000).toISOString(),
  page_path: "/search",
  properties,
  person_id,
  session_id
});

function baseInput() {
  return {
    now,
    events: [],
    inbox: [],
    journeyEnrollments: [],
    people: [],
    subscribers: [],
    failedBroadcasts: 0,
    healthChecks: [],
    pathwayIntelligence: [],
    articleIntelligence: []
  };
}

test("old unread Inbox work becomes an urgent deterministic signal", () => {
  const snapshot = buildStudioIntelligence({
    ...baseInput(),
    inbox: [{ id: "conversation-1", status: "open", unread_count: 2, last_inbound_at: new Date(now.getTime() - 30 * 3_600_000).toISOString() }]
  });
  const signal = snapshot.signals.find((item) => item.ruleId === "relationships.unread_inbox");
  assert.ok(signal);
  assert.equal(signal.priority, "urgent");
  assert.equal(signal.deterministic, true);
});

test("search gaps and rising exact queries are derived without AI", () => {
  const events = [
    event(1, "search_submitted", { query: "John 17:5" }, null, "current-1"),
    event(1.1, "search_submitted", { query: "John 17:5" }, null, "current-2"),
    event(1.2, "search_submitted", { query: "John 17:5" }, null, "current-3"),
    event(1.3, "search_no_results", { query: "John 17:5" }, null, "current-4"),
    event(1.4, "search_no_results", { query: "John 17:5" }, null, "current-5"),
    event(8, "search_submitted", { query: "John 17:5" }, null, "previous-1")
  ];
  const snapshot = buildStudioIntelligence({ ...baseInput(), events });
  assert.equal(snapshot.contentGaps[0]?.query, "john 17 5");
  assert.equal(snapshot.contentGaps[0]?.count, 2);
  assert.equal(snapshot.risingSearches[0]?.current, 3);
  assert.ok(snapshot.signals.some((item) => item.ruleId === "content.search_gaps"));
  assert.ok(snapshot.signals.some((item) => item.ruleId === "content.rising_exact_search"));
});

test("known study activity without an active journey becomes a relationship opportunity", () => {
  const events = [
    event(1, "scripture_opened", { contentKey: "john-14-9-11" }, "person-1", "study-1"),
    event(1.1, "pathway_started", { contentKey: "who-is-jesus-christ" }, "person-1", "study-1")
  ];
  const snapshot = buildStudioIntelligence({ ...baseInput(), events });
  assert.equal(snapshot.metrics.knownPeopleStudying7d, 1);
  assert.equal(snapshot.metrics.engagedWithoutJourney, 1);
  assert.ok(snapshot.signals.some((item) => item.ruleId === "relationships.study_without_journey"));
});

test("journey errors and system health failures outrank optimization signals", () => {
  const snapshot = buildStudioIntelligence({
    ...baseInput(),
    journeyEnrollments: [{ id: "e1", status: "active", last_error: "provider failure" }],
    healthChecks: [{ key: "instagram", label: "Instagram", state: "error", summary: "Webhook unavailable" }],
    articleIntelligence: [{ slug: "a", title: "Article", opens: 5, uniqueSessions: 5, completions: 0, completionRate: 0, appTransitions: 0 }]
  });
  assert.equal(snapshot.signals[0]?.priority, "urgent");
  assert.ok(snapshot.signals.slice(0, 2).every((item) => item.category === "journeys" || item.category === "operations"));
});
