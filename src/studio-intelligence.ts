import { articles } from "./data";
import { allPathways } from "./pathway-catalog";
import { buildArticleIntelligence, buildPathwayIntelligence, type StudyAnalyticsEvent } from "./study-intelligence";
import { buildStudioIntelligence, type IntelligenceAnalyticsEvent, type IntelligenceHealthCheck, type IntelligenceInboxConversation, type IntelligenceJourneyEnrollment, type IntelligencePerson, type IntelligenceSubscriber, type StudioIntelligenceSnapshot } from "./intelligence-engine";
import { getStudioHealth } from "./studio-health";
import { createServiceClient } from "./supabase";

const DAY = 86_400_000;

type RawEvent = {
  event_name: string;
  occurred_at: string;
  session_id: string | null;
  anonymous_id: string | null;
  person_id: string | null;
  page_path: string | null;
  properties: Record<string, unknown> | null;
};

export async function getStudioIntelligence(now = new Date()): Promise<StudioIntelligenceSnapshot> {
  const service = createServiceClient();
  const healthPromise = getStudioHealth().catch(() => ({ checks: [] as IntelligenceHealthCheck[] }));
  if (!service) {
    const health = await healthPromise;
    return buildStudioIntelligence({ now, events: [], inbox: [], journeyEnrollments: [], people: [], subscribers: [], failedBroadcasts: 0, healthChecks: health.checks as IntelligenceHealthCheck[], pathwayIntelligence: [], articleIntelligence: [] });
  }

  const since = new Date(now.getTime() - 14 * DAY).toISOString();
  const subscriberSince = new Date(now.getTime() - 14 * DAY).toISOString();

  const [eventsResult, inboxResult, enrollmentsResult, peopleResult, subscribersResult, failedBroadcastsResult, health] = await Promise.all([
    service.schema("analytics").from("events").select("event_name,occurred_at,session_id,anonymous_id,person_id,page_path,properties").gte("occurred_at", since).order("occurred_at", { ascending: false }).limit(15000),
    service.from("inbox_conversations").select("id,status,unread_count,last_inbound_at,last_outbound_at,updated_at").neq("status", "archived").limit(1000),
    service.from("growth_journey_enrollments").select("id,person_id,journey_id,status,last_error,next_action_at,updated_at").in("status", ["active", "waiting", "paused"]).limit(2000),
    service.from("people").select("id,status,last_seen_at").neq("status", "archived").limit(5000),
    service.from("email_subscribers").select("status,created_at").or(`status.eq.subscribed,created_at.gte.${subscriberSince}`).limit(5000),
    service.schema("analytics").from("email_campaigns").select("id", { count: "exact", head: true }).eq("status", "failed"),
    healthPromise
  ]);

  const rawEvents = (eventsResult.data ?? []) as unknown as RawEvent[];
  const events: IntelligenceAnalyticsEvent[] = rawEvents.map((event) => ({
    event_name: event.event_name,
    occurred_at: event.occurred_at,
    session_id: event.session_id,
    anonymous_id: event.anonymous_id,
    person_id: event.person_id,
    page_path: event.page_path,
    properties: event.properties ?? {}
  }));
  const studyEvents: StudyAnalyticsEvent[] = rawEvents.map((event) => ({
    event_name: event.event_name,
    page_path: event.page_path ?? "",
    session_id: event.session_id ?? "unknown",
    anonymous_id: event.anonymous_id ?? "unknown",
    properties: event.properties ?? {}
  }));

  const pathwayIntelligence = buildPathwayIntelligence(studyEvents, allPathways.map((pathway) => ({ slug: pathway.slug, title: pathway.title, stepCount: pathway.steps.length })));
  const articleIntelligence = buildArticleIntelligence(studyEvents, articles.map((article) => ({ slug: article.slug, title: article.title })));

  return buildStudioIntelligence({
    now,
    events,
    inbox: (inboxResult.data ?? []) as unknown as IntelligenceInboxConversation[],
    journeyEnrollments: (enrollmentsResult.data ?? []) as unknown as IntelligenceJourneyEnrollment[],
    people: (peopleResult.data ?? []) as unknown as IntelligencePerson[],
    subscribers: (subscribersResult.data ?? []) as unknown as IntelligenceSubscriber[],
    failedBroadcasts: failedBroadcastsResult.count ?? 0,
    healthChecks: health.checks as IntelligenceHealthCheck[],
    pathwayIntelligence,
    articleIntelligence
  });
}
