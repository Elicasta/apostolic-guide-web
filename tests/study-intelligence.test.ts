import assert from "node:assert/strict";
import test from "node:test";
import { buildArticleIntelligence, buildPathwayIntelligence, type StudyAnalyticsEvent } from "../src/study-intelligence";

function event(input: Partial<StudyAnalyticsEvent> & Pick<StudyAnalyticsEvent, "event_name" | "session_id">): StudyAnalyticsEvent {
  return {
    event_name: input.event_name,
    session_id: input.session_id,
    anonymous_id: input.anonymous_id ?? input.session_id,
    person_id: input.person_id ?? null,
    page_path: input.page_path ?? "/",
    properties: input.properties ?? {}
  };
}

test("pathway intelligence measures observed depth by session", () => {
  const events = [
    event({ event_name: "pathway_started", session_id: "a", page_path: "/pathways/jesus", properties: { contentKey: "jesus" } }),
    event({ event_name: "pathway_started", session_id: "b", page_path: "/pathways/jesus", properties: { contentKey: "jesus" } }),
    event({ event_name: "pathway_step_completed", session_id: "a", properties: { contentKey: "jesus", stepNumber: 1, stepCount: 4 } }),
    event({ event_name: "pathway_step_completed", session_id: "a", properties: { contentKey: "jesus", stepNumber: 4, stepCount: 4 } }),
    event({ event_name: "pathway_step_completed", session_id: "b", properties: { contentKey: "jesus", stepNumber: 2, stepCount: 4 } }),
    event({ event_name: "app_link_clicked", session_id: "a", page_path: "/pathways/jesus", properties: { origin: "website-pathway-jesus" } })
  ];

  const rows = buildPathwayIntelligence(events, [{ slug: "jesus", title: "Who Is Jesus?", stepCount: 4 }]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].starts, 2);
  assert.equal(rows[0].audioStarts, 0);
  assert.equal(rows[0].observedSteps, 3);
  assert.equal(rows[0].reachedFinalStep, 1);
  assert.equal(rows[0].completions, 1);
  assert.equal(rows[0].readingCompletions, 1);
  assert.equal(rows[0].audioCompletions, 0);
  assert.equal(rows[0].completionRate, 50);
  assert.equal(rows[0].averageProgress, 75);
  assert.equal(rows[0].appTransitions, 1);
});

test("reading and audio can both complete one Pathway without double-counting the session", () => {
  const events = [
    event({ event_name: "pathway_started", session_id: "a", person_id: "person-a", properties: { contentKey: "jesus" } }),
    event({ event_name: "audio_started", session_id: "a", person_id: "person-a", properties: { pathwaySlug: "jesus" } }),
    event({ event_name: "pathway_step_completed", session_id: "a", person_id: "person-a", properties: { contentKey: "jesus", stepNumber: 4, stepCount: 4 } }),
    event({ event_name: "audio_completed", session_id: "a", person_id: "person-a", properties: { pathwaySlug: "jesus", durationSeconds: 360 } }),
    event({ event_name: "pathway_completed", session_id: "a", person_id: "person-a", properties: { pathwaySlug: "jesus", completionMethod: "audio" } })
  ];

  const [row] = buildPathwayIntelligence(events, [{ slug: "jesus", title: "Who Is Jesus?", stepCount: 4 }]);
  assert.equal(row.uniqueSessions, 1);
  assert.equal(row.completions, 1);
  assert.equal(row.readingCompletions, 1);
  assert.equal(row.audioCompletions, 1);
  assert.equal(row.knownCompleters, 1);
  assert.equal(row.completionRate, 100);
  assert.equal(row.averageProgress, 100);
});

test("audio-only listening contributes to Pathway depth and completion", () => {
  const events = [
    event({ event_name: "audio_started", session_id: "audio", person_id: "listener", page_path: "/pathways/jesus", properties: { pathwaySlug: "jesus" } }),
    event({ event_name: "audio_progress", session_id: "audio", person_id: "listener", properties: { pathwaySlug: "jesus", positionSeconds: 180, durationSeconds: 360 } }),
    event({ event_name: "audio_completed", session_id: "audio", person_id: "listener", properties: { pathwaySlug: "jesus", durationSeconds: 360 } })
  ];

  const [row] = buildPathwayIntelligence(events, [{ slug: "jesus", title: "Who Is Jesus?", stepCount: 4 }]);
  assert.equal(row.starts, 0);
  assert.equal(row.audioStarts, 1);
  assert.equal(row.uniqueSessions, 1);
  assert.equal(row.audioCompletions, 1);
  assert.equal(row.completions, 1);
  assert.equal(row.knownCompleters, 1);
  assert.equal(row.completionRate, 100);
  assert.equal(row.averageProgress, 100);
});

test("pathway rows omit studies with no observed activity", () => {
  const rows = buildPathwayIntelligence([], [{ slug: "quiet", title: "Quiet", stepCount: 5 }]);
  assert.deepEqual(rows, []);
});

test("article intelligence uses unique reading sessions for completion rate", () => {
  const events = [
    event({ event_name: "article_opened", session_id: "a", page_path: "/articles/one", properties: { contentKey: "one" } }),
    event({ event_name: "article_opened", session_id: "a", page_path: "/articles/one", properties: { contentKey: "one" } }),
    event({ event_name: "article_opened", session_id: "b", page_path: "/articles/one", properties: { contentKey: "one" } }),
    event({ event_name: "article_completed", session_id: "a", page_path: "/articles/one", properties: { contentKey: "one" } }),
    event({ event_name: "app_link_clicked", session_id: "a", page_path: "/articles/one", properties: {} })
  ];

  const rows = buildArticleIntelligence(events, [{ slug: "one", title: "Article One" }]);
  assert.equal(rows[0].opens, 3);
  assert.equal(rows[0].uniqueSessions, 2);
  assert.equal(rows[0].completions, 1);
  assert.equal(rows[0].completionRate, 50);
  assert.equal(rows[0].appTransitions, 1);
});
