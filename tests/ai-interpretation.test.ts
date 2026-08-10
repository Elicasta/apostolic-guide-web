import assert from "node:assert/strict";
import test from "node:test";
import { buildAIInterpretationContext, interpretStudioIntelligence } from "../src/ai-interpretation";
import { buildStudioIntelligence } from "../src/intelligence-engine";

function snapshot() {
  return buildStudioIntelligence({
    now: new Date("2026-08-10T17:00:00.000Z"),
    events: [
      { event_name: "search_submitted", occurred_at: "2026-08-10T16:00:00.000Z", session_id: "session-private", person_id: "person-private", page_path: "/search", properties: { query: "John 17:5" } },
      { event_name: "search_no_results", occurred_at: "2026-08-10T16:00:05.000Z", session_id: "session-private", person_id: "person-private", page_path: "/search", properties: { query: "John 17:5" } }
    ],
    inbox: [{ id: "conversation-private", status: "open", unread_count: 1, last_inbound_at: "2026-08-09T12:00:00.000Z" }],
    journeyEnrollments: [],
    people: [{ id: "person-private", status: "lead", last_seen_at: "2026-08-10T16:00:00.000Z" }],
    subscribers: [],
    failedBroadcasts: 0,
    healthChecks: [],
    pathwayIntelligence: [],
    articleIntelligence: []
  });
}

test("aggregate AI context withholds identifiers, private bodies, and user-authored search text", () => {
  const context = buildAIInterpretationContext(snapshot());
  const serialized = JSON.stringify(context);
  assert.equal(context.mode, "aggregate");
  assert.equal(context.policy.deterministicSourceOfTruth, true);
  assert.equal(context.policy.mayInventMetrics, false);
  assert.equal(context.policy.containsPrivateMessageBodies, false);
  assert.equal(context.policy.containsPrivateNotes, false);
  assert.equal(context.policy.includesSystemDirectIdentifiers, false);
  assert.equal(context.policy.containsUserAuthoredSearchText, false);
  assert.equal(context.policy.userAuthoredSearchTextMayContainSensitiveData, false);
  assert.equal(serialized.includes("person-private"), false);
  assert.equal(serialized.includes("conversation-private"), false);
  assert.equal(serialized.includes("session-private"), false);
  assert.equal(serialized.toLowerCase().includes("john 17 5"), false);
});

test("content discovery mode explicitly includes search language and marks its sensitivity boundary", () => {
  const context = buildAIInterpretationContext(snapshot(), "content_discovery");
  const serialized = JSON.stringify(context);
  assert.equal(context.policy.containsUserAuthoredSearchText, true);
  assert.equal(context.policy.userAuthoredSearchTextMayContainSensitiveData, true);
  assert.equal(context.policy.includesSystemDirectIdentifiers, false);
  assert.equal(serialized.toLowerCase().includes("john 17 5"), true);
  assert.equal(serialized.includes("person-private"), false);
  assert.equal(serialized.includes("conversation-private"), false);
});

test("application returns deterministic interpretation when no AI provider exists", async () => {
  const result = await interpretStudioIntelligence(snapshot(), null);
  assert.equal(result.mode, "deterministic");
  assert.equal(result.provider, null);
  assert.ok(result.summary.length > 0);
});

test("AI provider failure falls back to deterministic interpretation", async () => {
  const result = await interpretStudioIntelligence(snapshot(), {
    name: "broken-provider",
    async interpret() { throw new Error("offline"); }
  });
  assert.equal(result.mode, "deterministic");
  assert.equal(result.provider, null);
});
