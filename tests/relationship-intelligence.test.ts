import assert from "node:assert/strict";
import test from "node:test";
import { buildRelationshipIntelligence } from "../src/relationship-intelligence";

const now = new Date("2026-08-10T16:00:00.000Z");
const person = {
  personStatus: "lead",
  lastSeenAt: "2026-08-10T15:00:00.000Z",
  tags: [] as string[],
  websiteEvents: [] as Array<{ eventName: string; at: string; pagePath?: string | null; contentKey?: string | null }>,
  journeys: [] as Array<{ id: string; name: string; status: string }>,
  inbox: null,
  now
};

test("unread Inbox activity takes follow-up priority", () => {
  const result = buildRelationshipIntelligence({
    ...person,
    inbox: { id: "conversation-1", status: "open", unreadCount: 2, lastInboundAt: "2026-08-10T15:30:00.000Z" }
  });
  assert.equal(result.state, "follow_up");
  assert.equal(result.nextAction.href, "/admin/inbox/conversation-1");
  assert.match(result.summary, /2 unread Inbox messages/);
});

test("two recent study events classify the relationship as studying", () => {
  const result = buildRelationshipIntelligence({
    ...person,
    websiteEvents: [
      { eventName: "scripture_opened", at: "2026-08-10T14:00:00.000Z", pagePath: "/scripture/john/1/1" },
      { eventName: "article_completed", at: "2026-08-09T14:00:00.000Z", pagePath: "/articles/the-one-god-revealed-in-jesus-christ" }
    ]
  });
  assert.equal(result.state, "studying");
  assert.equal(result.signals.find((signal) => signal.label === "Study / 7d")?.value, "2");
});

test("recent study without an active journey recommends reviewing Journeys", () => {
  const result = buildRelationshipIntelligence({
    ...person,
    websiteEvents: [
      { eventName: "pathway_started", at: "2026-08-10T14:00:00.000Z", pagePath: "/pathways/who-is-jesus-christ", contentKey: "who-is-jesus-christ" }
    ]
  });
  assert.equal(result.state, "studying");
  assert.equal(result.nextAction.href, "/admin/journeys");
});

test("an active journey becomes the next action when no Inbox follow-up is waiting", () => {
  const result = buildRelationshipIntelligence({
    ...person,
    websiteEvents: [],
    journeys: [{ id: "journey-1", name: "Jesus Is God Interest", status: "active" }]
  });
  assert.equal(result.nextAction.href, "/admin/journeys/journey-1");
  assert.match(result.summary, /Jesus Is God Interest/);
});

test("old activity with no relationship signals remains quiet", () => {
  const result = buildRelationshipIntelligence({
    ...person,
    lastSeenAt: "2026-05-01T12:00:00.000Z",
    websiteEvents: [{ eventName: "article_opened", at: "2026-05-01T12:00:00.000Z", pagePath: "/articles/old-study" }]
  });
  assert.equal(result.state, "quiet");
  assert.equal(result.nextAction.href, "#relationship-history");
});

test("interest signals deduplicate tags and recent content", () => {
  const result = buildRelationshipIntelligence({
    ...person,
    tags: ["jesus-is-god", "Baptism"],
    websiteEvents: [
      { eventName: "article_opened", at: "2026-08-10T14:00:00.000Z", pagePath: "/articles/jesus-is-god", contentKey: "jesus-is-god" },
      { eventName: "pathway_started", at: "2026-08-09T14:00:00.000Z", pagePath: "/pathways/baptism", contentKey: "baptism" }
    ]
  });
  assert.deepEqual(result.interests, ["Jesus Is God", "Baptism"]);
});
