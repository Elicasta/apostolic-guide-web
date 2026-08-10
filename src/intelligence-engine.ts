import type { ArticleIntelligenceRow, PathwayIntelligenceRow } from "./study-intelligence";

export type IntelligencePriority = "urgent" | "high" | "medium" | "low" | "info";
export type IntelligenceCategory = "relationships" | "study" | "content" | "growth" | "journeys" | "operations";

export type IntelligenceEvidence = { label: string; value: string | number };
export type IntelligenceAction = { label: string; href: string };

export type IntelligenceSignal = {
  id: string;
  ruleId: string;
  category: IntelligenceCategory;
  priority: IntelligencePriority;
  score: number;
  title: string;
  summary: string;
  evidence: IntelligenceEvidence[];
  action?: IntelligenceAction;
  deterministic: true;
};

export type IntelligenceAnalyticsEvent = {
  event_name: string;
  occurred_at: string;
  session_id?: string | null;
  anonymous_id?: string | null;
  person_id?: string | null;
  page_path?: string | null;
  properties?: Record<string, unknown> | null;
};

export type IntelligenceInboxConversation = {
  id: string;
  status: string;
  unread_count: number;
  last_inbound_at?: string | null;
  last_outbound_at?: string | null;
  updated_at?: string | null;
};

export type IntelligenceJourneyEnrollment = {
  id: string;
  person_id?: string | null;
  journey_id?: string | null;
  status: string;
  last_error?: string | null;
  next_action_at?: string | null;
  updated_at?: string | null;
};

export type IntelligencePerson = {
  id: string;
  status: string;
  last_seen_at?: string | null;
};

export type IntelligenceSubscriber = {
  status: string;
  created_at?: string | null;
};

export type IntelligenceHealthCheck = {
  key: string;
  label: string;
  state: "healthy" | "warning" | "error" | "not_configured";
  summary: string;
};

export type IntelligenceMetrics = {
  peopleTotal: number;
  subscribersTotal: number;
  unreadConversations: number;
  followUpConversations: number;
  activeJourneys: number;
  journeyErrors: number;
  overdueJourneyActions: number;
  studySessions7d: number;
  knownPeopleStudying7d: number;
  engagedWithoutJourney: number;
  quietPeople30d: number;
  searches7d: number;
  noResultSearches7d: number;
  noResultRate7d: number;
  appTransitions7d: number;
  newSubscribers7d: number;
};

export type IntelligenceTrend = {
  key: string;
  current: number;
  previous: number;
  changePercent: number | null;
};

export type IntelligenceContentGap = { query: string; count: number };

export type StudioIntelligenceSnapshot = {
  schemaVersion: 1;
  generatedAt: string;
  window: { currentStart: string; previousStart: string; end: string };
  metrics: IntelligenceMetrics;
  trends: {
    searches: IntelligenceTrend;
    studySessions: IntelligenceTrend;
    appTransitions: IntelligenceTrend;
    newSubscribers: IntelligenceTrend;
  };
  contentGaps: IntelligenceContentGap[];
  risingSearches: IntelligenceTrend[];
  pathwayIntelligence: PathwayIntelligenceRow[];
  articleIntelligence: ArticleIntelligenceRow[];
  signals: IntelligenceSignal[];
};

export type IntelligenceEngineInput = {
  now?: Date;
  events: IntelligenceAnalyticsEvent[];
  inbox: IntelligenceInboxConversation[];
  journeyEnrollments: IntelligenceJourneyEnrollment[];
  people: IntelligencePerson[];
  subscribers: IntelligenceSubscriber[];
  failedBroadcasts: number;
  healthChecks: IntelligenceHealthCheck[];
  pathwayIntelligence: PathwayIntelligenceRow[];
  articleIntelligence: ArticleIntelligenceRow[];
};

const DAY = 86_400_000;
const STUDY_EVENTS = new Set(["article_opened", "article_completed", "pathway_started", "pathway_step_completed", "scripture_opened", "topic_opened", "answer_opened", "search_submitted", "search_result_opened"]);
const PRIORITY_BASE: Record<IntelligencePriority, number> = { urgent: 500, high: 400, medium: 300, low: 200, info: 100 };

function validDate(value?: string | null) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function inRange(value: string, start: number, end: number) {
  const time = validDate(value);
  return time !== null && time >= start && time < end;
}

function normalizeQuery(value: unknown) {
  return String(value ?? "")
    .toLocaleLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function queryFromEvent(event: IntelligenceAnalyticsEvent) {
  return normalizeQuery(event.properties?.query);
}

function countBy<T>(values: T[], key: (value: T) => string) {
  const result = new Map<string, number>();
  for (const value of values) {
    const item = key(value);
    if (!item) continue;
    result.set(item, (result.get(item) ?? 0) + 1);
  }
  return result;
}

function percentChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 100);
}

function trend(key: string, current: number, previous: number): IntelligenceTrend {
  return { key, current, previous, changePercent: percentChange(current, previous) };
}

function priorityScore(priority: IntelligencePriority, impact = 0, urgency = 0) {
  return PRIORITY_BASE[priority] + Math.min(75, Math.max(0, impact)) + Math.min(24, Math.max(0, urgency));
}

function signal(input: Omit<IntelligenceSignal, "score" | "deterministic"> & { impact?: number; urgency?: number }): IntelligenceSignal {
  return {
    id: `${input.ruleId}:${input.id}`,
    ruleId: input.ruleId,
    category: input.category,
    priority: input.priority,
    score: priorityScore(input.priority, input.impact, input.urgency),
    title: input.title,
    summary: input.summary,
    evidence: input.evidence,
    action: input.action,
    deterministic: true
  };
}

export function buildStudioIntelligence(input: IntelligenceEngineInput): StudioIntelligenceSnapshot {
  const now = input.now ?? new Date();
  const end = now.getTime();
  const currentStart = end - 7 * DAY;
  const previousStart = end - 14 * DAY;

  const currentEvents = input.events.filter((event) => inRange(event.occurred_at, currentStart, end));
  const previousEvents = input.events.filter((event) => inRange(event.occurred_at, previousStart, currentStart));
  const currentStudyEvents = currentEvents.filter((event) => STUDY_EVENTS.has(event.event_name));
  const previousStudyEvents = previousEvents.filter((event) => STUDY_EVENTS.has(event.event_name));
  const studySessions7d = new Set(currentStudyEvents.map((event) => event.session_id).filter(Boolean)).size;
  const previousStudySessions = new Set(previousStudyEvents.map((event) => event.session_id).filter(Boolean)).size;
  const knownStudyPeople = new Set(currentStudyEvents.map((event) => event.person_id).filter((value): value is string => Boolean(value)));
  const activeJourneyPeople = new Set(input.journeyEnrollments.filter((row) => ["active", "waiting", "paused"].includes(row.status)).map((row) => row.person_id).filter((value): value is string => Boolean(value)));
  const engagedWithoutJourney = Array.from(knownStudyPeople).filter((personId) => !activeJourneyPeople.has(personId)).length;

  const unreadConversations = input.inbox.filter((row) => Number(row.unread_count) > 0);
  const followUpConversations = input.inbox.filter((row) => row.status === "follow_up");
  const oldestUnreadAt = unreadConversations
    .map((row) => validDate(row.last_inbound_at ?? row.updated_at))
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b)[0] ?? null;
  const oldestUnreadHours = oldestUnreadAt === null ? 0 : Math.max(0, Math.floor((end - oldestUnreadAt) / 3_600_000));

  const journeyErrors = input.journeyEnrollments.filter((row) => Boolean(row.last_error));
  const overdueJourneyActions = input.journeyEnrollments.filter((row) => {
    if (!["waiting", "active"].includes(row.status)) return false;
    const due = validDate(row.next_action_at);
    return due !== null && due < end - 60 * 60 * 1000;
  });
  const activeJourneys = input.journeyEnrollments.filter((row) => ["active", "waiting", "paused"].includes(row.status)).length;

  const quietPeople30d = input.people.filter((person) => {
    if (["archived", "inactive"].includes(person.status)) return false;
    const lastSeen = validDate(person.last_seen_at);
    return lastSeen !== null && end - lastSeen > 30 * DAY;
  }).length;

  const currentSearches = currentEvents.filter((event) => event.event_name === "search_submitted");
  const previousSearches = previousEvents.filter((event) => event.event_name === "search_submitted");
  const currentNoResults = currentEvents.filter((event) => event.event_name === "search_no_results");
  const currentAppTransitions = currentEvents.filter((event) => event.event_name === "app_link_clicked").length;
  const previousAppTransitions = previousEvents.filter((event) => event.event_name === "app_link_clicked").length;
  const currentNewSubscribers = input.subscribers.filter((row) => row.status === "subscribed" && row.created_at && inRange(row.created_at, currentStart, end)).length;
  const previousNewSubscribers = input.subscribers.filter((row) => row.status === "subscribed" && row.created_at && inRange(row.created_at, previousStart, currentStart)).length;

  const gapCounts = countBy(currentNoResults, queryFromEvent);
  const contentGaps = Array.from(gapCounts.entries()).map(([query, count]) => ({ query, count })).sort((a, b) => b.count - a.count || a.query.localeCompare(b.query)).slice(0, 10);

  const currentSearchCounts = countBy(currentSearches, queryFromEvent);
  const previousSearchCounts = countBy(previousSearches, queryFromEvent);
  const risingSearches = Array.from(currentSearchCounts.entries())
    .map(([key, current]) => trend(key, current, previousSearchCounts.get(key) ?? 0))
    .filter((item) => item.current >= 3 && (item.previous === 0 || item.current >= item.previous * 1.5))
    .sort((a, b) => b.current - a.current || (b.changePercent ?? 999) - (a.changePercent ?? 999))
    .slice(0, 8);

  const metrics: IntelligenceMetrics = {
    peopleTotal: input.people.filter((person) => person.status !== "archived").length,
    subscribersTotal: input.subscribers.filter((row) => row.status === "subscribed").length,
    unreadConversations: unreadConversations.length,
    followUpConversations: followUpConversations.length,
    activeJourneys,
    journeyErrors: journeyErrors.length,
    overdueJourneyActions: overdueJourneyActions.length,
    studySessions7d,
    knownPeopleStudying7d: knownStudyPeople.size,
    engagedWithoutJourney,
    quietPeople30d,
    searches7d: currentSearches.length,
    noResultSearches7d: currentNoResults.length,
    noResultRate7d: currentSearches.length ? Math.round((currentNoResults.length / currentSearches.length) * 100) : 0,
    appTransitions7d: currentAppTransitions,
    newSubscribers7d: currentNewSubscribers
  };

  const trends = {
    searches: trend("searches", currentSearches.length, previousSearches.length),
    studySessions: trend("study_sessions", studySessions7d, previousStudySessions),
    appTransitions: trend("app_transitions", currentAppTransitions, previousAppTransitions),
    newSubscribers: trend("new_subscribers", currentNewSubscribers, previousNewSubscribers)
  };

  const signals: IntelligenceSignal[] = [];

  if (unreadConversations.length > 0) {
    const priority: IntelligencePriority = oldestUnreadHours >= 24 ? "urgent" : "high";
    signals.push(signal({ id: "unread", ruleId: "relationships.unread_inbox", category: "relationships", priority, impact: unreadConversations.length * 8, urgency: Math.min(24, oldestUnreadHours), title: `${unreadConversations.length} ${unreadConversations.length === 1 ? "conversation needs" : "conversations need"} attention`, summary: oldestUnreadHours >= 24 ? `The oldest unread inbound message has been waiting about ${oldestUnreadHours} hours.` : "Unread inbound messages are waiting in Inbox.", evidence: [{ label: "Unread conversations", value: unreadConversations.length }, { label: "Oldest wait", value: `${oldestUnreadHours}h` }], action: { label: "Open Inbox", href: "/admin/inbox?status=open" } }));
  }

  if (followUpConversations.length > 0) {
    signals.push(signal({ id: "follow-up", ruleId: "relationships.explicit_follow_up", category: "relationships", priority: "high", impact: followUpConversations.length * 7, title: `${followUpConversations.length} ${followUpConversations.length === 1 ? "conversation is" : "conversations are"} marked for follow-up`, summary: "These were explicitly marked for human attention and should stay ahead of general optimization work.", evidence: [{ label: "Follow-up conversations", value: followUpConversations.length }], action: { label: "Review follow-up", href: "/admin/inbox?status=follow_up" } }));
  }

  if (journeyErrors.length > 0) {
    signals.push(signal({ id: "errors", ruleId: "journeys.execution_errors", category: "journeys", priority: "urgent", impact: journeyErrors.length * 10, title: `${journeyErrors.length} journey ${journeyErrors.length === 1 ? "enrollment has" : "enrollments have"} an error`, summary: "Journey execution errors can interrupt planned follow-up and should be resolved before adding more automation.", evidence: [{ label: "Journey errors", value: journeyErrors.length }], action: { label: "Open Journeys", href: "/admin/journeys" } }));
  }

  if (overdueJourneyActions.length > 0) {
    signals.push(signal({ id: "overdue", ruleId: "journeys.overdue_actions", category: "journeys", priority: "high", impact: overdueJourneyActions.length * 7, title: `${overdueJourneyActions.length} journey ${overdueJourneyActions.length === 1 ? "action is" : "actions are"} overdue`, summary: "The next action time has passed but the enrollment is still active or waiting.", evidence: [{ label: "Overdue actions", value: overdueJourneyActions.length }], action: { label: "Review Journeys", href: "/admin/journeys" } }));
  }

  if (engagedWithoutJourney > 0) {
    signals.push(signal({ id: "study-no-journey", ruleId: "relationships.study_without_journey", category: "relationships", priority: "medium", impact: engagedWithoutJourney * 5, title: `${engagedWithoutJourney} known ${engagedWithoutJourney === 1 ? "person is" : "people are"} studying without an active journey`, summary: "Known people have recent study activity but no active, waiting, or paused journey enrollment.", evidence: [{ label: "Known people studying", value: knownStudyPeople.size }, { label: "Without active journey", value: engagedWithoutJourney }], action: { label: "Review People", href: "/admin/people" } }));
  }

  if (quietPeople30d > 0) {
    signals.push(signal({ id: "quiet-people", ruleId: "relationships.quiet_30d", category: "relationships", priority: "low", impact: quietPeople30d * 2, title: `${quietPeople30d} active-status ${quietPeople30d === 1 ? "person has" : "people have"} been quiet for 30+ days`, summary: "These records are not archived or already marked inactive, but no recent activity is recorded.", evidence: [{ label: "Quiet 30+ days", value: quietPeople30d }], action: { label: "Open Segments", href: "/admin/segments" } }));
  }

  if (metrics.noResultSearches7d > 0) {
    const priority: IntelligencePriority = metrics.noResultRate7d >= 25 && metrics.searches7d >= 8 ? "high" : metrics.noResultSearches7d >= 3 ? "medium" : "low";
    signals.push(signal({ id: "search-gaps", ruleId: "content.search_gaps", category: "content", priority, impact: metrics.noResultSearches7d * 5, title: `${metrics.noResultSearches7d} searches returned no strong result this week`, summary: contentGaps[0] ? `The most repeated exact gap is “${contentGaps[0].query}” (${contentGaps[0].count}).` : "Searches are exposing content coverage gaps.", evidence: [{ label: "No-result searches", value: metrics.noResultSearches7d }, { label: "No-result rate", value: `${metrics.noResultRate7d}%` }], action: { label: "Review Analytics", href: "/admin/analytics" } }));
  }

  for (const item of risingSearches.slice(0, 3)) {
    signals.push(signal({ id: item.key, ruleId: "content.rising_exact_search", category: "content", priority: item.current >= 8 ? "medium" : "low", impact: item.current * 3, title: `Search interest is rising for “${item.key}”`, summary: item.previous === 0 ? `${item.current} searches this week with none recorded in the previous comparison window.` : `${item.current} searches this week versus ${item.previous} in the prior week (${item.changePercent}% change).`, evidence: [{ label: "This week", value: item.current }, { label: "Previous week", value: item.previous }], action: { label: "Review search behavior", href: "/admin/analytics" } }));
  }

  const weakPathway = input.pathwayIntelligence.filter((row) => row.uniqueSessions >= 5 && row.averageProgress < 35).sort((a, b) => a.averageProgress - b.averageProgress)[0];
  if (weakPathway) {
    signals.push(signal({ id: weakPathway.slug, ruleId: "study.pathway_dropoff", category: "study", priority: "medium", impact: weakPathway.uniqueSessions * 3, title: `${weakPathway.title} is losing study depth`, summary: `Observed average pathway progress is ${weakPathway.averageProgress}% across ${weakPathway.uniqueSessions} study sessions.`, evidence: [{ label: "Study sessions", value: weakPathway.uniqueSessions }, { label: "Average progress", value: `${weakPathway.averageProgress}%` }, { label: "Reached final step", value: weakPathway.reachedFinalStep }], action: { label: "Open pathway analytics", href: "/admin/analytics" } }));
  }

  const strongPathway = input.pathwayIntelligence.filter((row) => row.uniqueSessions >= 5 && row.averageProgress >= 65).sort((a, b) => b.averageProgress - a.averageProgress)[0];
  if (strongPathway) {
    signals.push(signal({ id: strongPathway.slug, ruleId: "study.pathway_strength", category: "study", priority: "info", impact: strongPathway.uniqueSessions * 2, title: `${strongPathway.title} is holding attention`, summary: `Observed average pathway progress is ${strongPathway.averageProgress}% across ${strongPathway.uniqueSessions} study sessions.`, evidence: [{ label: "Study sessions", value: strongPathway.uniqueSessions }, { label: "Average progress", value: `${strongPathway.averageProgress}%` }], action: { label: "Review pathway", href: `/pathways/${strongPathway.slug}` } }));
  }

  const weakArticle = input.articleIntelligence.filter((row) => row.uniqueSessions >= 5 && row.completionRate < 25).sort((a, b) => a.completionRate - b.completionRate)[0];
  if (weakArticle) {
    signals.push(signal({ id: weakArticle.slug, ruleId: "study.article_low_completion", category: "study", priority: "medium", impact: weakArticle.uniqueSessions * 2, title: `${weakArticle.title} has low observed completion`, summary: `${weakArticle.completionRate}% of observed article sessions reached the meaningful-completion threshold.`, evidence: [{ label: "Sessions", value: weakArticle.uniqueSessions }, { label: "Completion rate", value: `${weakArticle.completionRate}%` }], action: { label: "Review article", href: `/articles/${weakArticle.slug}` } }));
  }

  const strongArticle = input.articleIntelligence.filter((row) => row.uniqueSessions >= 5 && row.completionRate >= 60).sort((a, b) => b.completionRate - a.completionRate)[0];
  if (strongArticle) {
    signals.push(signal({ id: strongArticle.slug, ruleId: "study.article_strength", category: "study", priority: "info", impact: strongArticle.uniqueSessions, title: `${strongArticle.title} is completing well`, summary: `${strongArticle.completionRate}% of observed sessions met the meaningful-completion threshold.`, evidence: [{ label: "Sessions", value: strongArticle.uniqueSessions }, { label: "Completion rate", value: `${strongArticle.completionRate}%` }], action: { label: "Review article", href: `/articles/${strongArticle.slug}` } }));
  }

  if (trends.studySessions.current >= 5 && (trends.studySessions.previous === 0 || trends.studySessions.current >= trends.studySessions.previous * 1.3)) {
    signals.push(signal({ id: "study-momentum", ruleId: "growth.study_momentum", category: "growth", priority: "info", impact: trends.studySessions.current, title: "Study activity is gaining momentum", summary: trends.studySessions.previous === 0 ? `${trends.studySessions.current} study sessions were observed this week.` : `${trends.studySessions.current} study sessions this week versus ${trends.studySessions.previous} last week.`, evidence: [{ label: "Current study sessions", value: trends.studySessions.current }, { label: "Previous", value: trends.studySessions.previous }], action: { label: "Review Analytics", href: "/admin/analytics" } }));
  }

  if (currentNewSubscribers >= 3 && (previousNewSubscribers === 0 || currentNewSubscribers >= previousNewSubscribers * 1.25)) {
    signals.push(signal({ id: "subscriber-growth", ruleId: "growth.subscriber_momentum", category: "growth", priority: "info", impact: currentNewSubscribers * 2, title: "Subscriber growth is up", summary: previousNewSubscribers === 0 ? `${currentNewSubscribers} new subscribers were added this week.` : `${currentNewSubscribers} new subscribers this week versus ${previousNewSubscribers} last week.`, evidence: [{ label: "New subscribers", value: currentNewSubscribers }, { label: "Previous week", value: previousNewSubscribers }], action: { label: "Open People", href: "/admin/people" } }));
  }

  if (input.failedBroadcasts > 0) {
    signals.push(signal({ id: "failed-broadcasts", ruleId: "operations.failed_broadcasts", category: "operations", priority: "high", impact: input.failedBroadcasts * 9, title: `${input.failedBroadcasts} ${input.failedBroadcasts === 1 ? "broadcast has" : "broadcasts have"} failed`, summary: "Delivery failures should be resolved before sending another campaign to the same audience.", evidence: [{ label: "Failed broadcasts", value: input.failedBroadcasts }], action: { label: "Open Broadcasts", href: "/admin/broadcasts" } }));
  }

  const healthErrors = input.healthChecks.filter((check) => check.state === "error");
  const healthWarnings = input.healthChecks.filter((check) => check.state === "warning" || check.state === "not_configured");
  if (healthErrors.length > 0) {
    signals.push(signal({ id: "health-errors", ruleId: "operations.health_errors", category: "operations", priority: "urgent", impact: healthErrors.length * 10, title: `${healthErrors.length} system ${healthErrors.length === 1 ? "check is" : "checks are"} failing`, summary: healthErrors.slice(0, 3).map((check) => check.label).join(", "), evidence: healthErrors.slice(0, 5).map((check) => ({ label: check.label, value: check.summary })), action: { label: "Open Health", href: "/admin/health" } }));
  } else if (healthWarnings.length > 0) {
    signals.push(signal({ id: "health-warnings", ruleId: "operations.health_warnings", category: "operations", priority: "medium", impact: healthWarnings.length * 5, title: `${healthWarnings.length} system ${healthWarnings.length === 1 ? "check needs" : "checks need"} attention`, summary: healthWarnings.slice(0, 3).map((check) => check.label).join(", "), evidence: healthWarnings.slice(0, 5).map((check) => ({ label: check.label, value: check.summary })), action: { label: "Open Health", href: "/admin/health" } }));
  }

  signals.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));

  return {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    window: { currentStart: new Date(currentStart).toISOString(), previousStart: new Date(previousStart).toISOString(), end: now.toISOString() },
    metrics,
    trends,
    contentGaps,
    risingSearches,
    pathwayIntelligence: input.pathwayIntelligence,
    articleIntelligence: input.articleIntelligence,
    signals
  };
}
