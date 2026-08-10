import assert from "node:assert/strict";
import test from "node:test";
import { emptyPersonSignals, matchesSystemSegment } from "../src/segments";
import type { Person } from "../src/people-crm";

const NOW = Date.parse("2026-08-10T15:00:00.000Z");

function person(overrides: Partial<Person> = {}): Person {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    display_name: "Test Person",
    first_name: null,
    last_name: null,
    email: null,
    instagram_user_id: null,
    instagram_username: null,
    phone: null,
    status: "lead",
    source: "website",
    source_detail: null,
    first_seen_at: "2026-08-01T15:00:00.000Z",
    last_seen_at: "2026-08-10T14:00:00.000Z",
    created_at: "2026-08-01T15:00:00.000Z",
    updated_at: "2026-08-10T14:00:00.000Z",
    ...overrides
  };
}

test("lifecycle and activity segments use observable dates and status", () => {
  const signals = emptyPersonSignals();
  assert.equal(matchesSystemSegment("lead", person(), signals, NOW), true);
  assert.equal(matchesSystemSegment("active_7d", person(), signals, NOW), true);
  assert.equal(matchesSystemSegment("new_7d", person(), signals, NOW), false);
  assert.equal(matchesSystemSegment("inactive_30d", person({ last_seen_at: "2026-06-01T00:00:00.000Z" }), signals, NOW), true);
});

test("channel segments honor linked identities", () => {
  const signals = emptyPersonSignals();
  signals.identities.add("instagram");
  signals.identities.add("email");
  assert.equal(matchesSystemSegment("instagram", person(), signals, NOW), true);
  assert.equal(matchesSystemSegment("email", person(), signals, NOW), true);
});

test("study segments are based on recent first-party analytics", () => {
  const signals = emptyPersonSignals();
  signals.analytics.push({ event_name: "pathway_started", occurred_at: "2026-08-09T12:00:00.000Z" });
  signals.analytics.push({ event_name: "article_completed", occurred_at: "2026-08-09T12:05:00.000Z" });
  assert.equal(matchesSystemSegment("studying_7d", person(), signals, NOW), true);
  assert.equal(matchesSystemSegment("pathway_30d", person(), signals, NOW), true);
  assert.equal(matchesSystemSegment("article_completed_30d", person(), signals, NOW), true);
});

test("journey and follow-up segments reflect workflow state", () => {
  const signals = emptyPersonSignals();
  signals.journeyStatuses.add("paused");
  signals.unreadInbox = 2;
  signals.followUpInbox = true;
  assert.equal(matchesSystemSegment("in_journey", person(), signals, NOW), true);
  assert.equal(matchesSystemSegment("journey_manual", person(), signals, NOW), true);
  assert.equal(matchesSystemSegment("no_active_journey", person(), signals, NOW), false);
  assert.equal(matchesSystemSegment("unread_inbox", person(), signals, NOW), true);
  assert.equal(matchesSystemSegment("follow_up", person(), signals, NOW), true);
});
