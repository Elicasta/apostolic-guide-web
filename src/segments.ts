import { createServiceClient } from "./supabase";
import type { Person } from "./people-crm";
import { evaluateSegmentRuleSet, type CustomSegmentRule, type SegmentMatchMode } from "./segment-rules";

const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVE_JOURNEY_STATES = ["active", "waiting", "paused"];

export type SegmentCategory = "Lifecycle" | "Engagement" | "Channels" | "Follow-up" | "Journeys" | "Interests" | "Custom";

export type SegmentDefinition = {
  key: string;
  label: string;
  description: string;
  category: SegmentCategory;
  count: number;
  dynamic?: boolean;
  customId?: string;
};

export type CustomSegmentRecord = {
  id: string;
  name: string;
  description: string | null;
  match_mode: SegmentMatchMode;
  rules: CustomSegmentRule[];
  created_at: string;
  updated_at: string;
};

export type PersonSignals = {
  identities: Set<string>;
  tags: Set<string>;
  journeyStatuses: Set<string>;
  journeyStatusById: Map<string, Set<string>>;
  unreadInbox: number;
  followUpInbox: boolean;
  analytics: Array<{ event_name: string; occurred_at: string }>;
};

export type SegmentedPerson = Person & {
  tags: string[];
  identityProviders: string[];
  activeJourneyCount: number;
  unreadCount: number;
};

type JourneyRow = { id: string; name: string; status: string };

export const SYSTEM_SEGMENTS: Omit<SegmentDefinition, "count">[] = [
  { key: "all", label: "All people", description: "Every active relationship record in Apostolic Guide.", category: "Lifecycle" },
  { key: "new_7d", label: "New this week", description: "People first seen during the last 7 days.", category: "Lifecycle" },
  { key: "lead", label: "Leads", description: "People currently in the lead lifecycle state.", category: "Lifecycle" },
  { key: "subscriber", label: "Subscribers", description: "People who are currently subscribed by email.", category: "Lifecycle" },
  { key: "app_user", label: "App users", description: "People whose lifecycle state is app user.", category: "Lifecycle" },
  { key: "inactive_30d", label: "Inactive 30 days", description: "People who have not been seen during the last 30 days.", category: "Lifecycle" },

  { key: "active_7d", label: "Active this week", description: "People with activity during the last 7 days.", category: "Engagement" },
  { key: "returning_30d", label: "Returning", description: "Established people who returned during the last 30 days.", category: "Engagement" },
  { key: "studying_7d", label: "Studying now", description: "People who opened Scripture, articles, answers, topics, pathways, or search during the last 7 days.", category: "Engagement" },
  { key: "pathway_30d", label: "Pathway starters", description: "People who started a pathway during the last 30 days.", category: "Engagement" },
  { key: "article_completed_30d", label: "Article completers", description: "People who completed an article read during the last 30 days.", category: "Engagement" },
  { key: "searchers_30d", label: "Searchers", description: "People who searched Apostolic Guide during the last 30 days.", category: "Engagement" },
  { key: "app_transition_30d", label: "App transitions", description: "People who clicked into the Apostolic Guide app during the last 30 days.", category: "Engagement" },

  { key: "instagram", label: "Instagram", description: "People with an Instagram identity or Instagram as their first source.", category: "Channels" },
  { key: "email", label: "Email", description: "People with a linked email identity.", category: "Channels" },
  { key: "website", label: "Website", description: "People first discovered on the website or linked through browser activity.", category: "Channels" },
  { key: "app_identity", label: "App identity", description: "People with a linked Apostolic Guide app identity.", category: "Channels" },

  { key: "unread_inbox", label: "Unread conversations", description: "People with unread Inbox messages that need attention.", category: "Follow-up" },
  { key: "follow_up", label: "Marked for follow-up", description: "People whose Inbox conversation is explicitly marked Follow up.", category: "Follow-up" },

  { key: "in_journey", label: "In a journey", description: "People currently active, waiting, or paused inside any journey.", category: "Journeys" },
  { key: "journey_waiting", label: "Journey waiting", description: "People currently waiting for the next journey action.", category: "Journeys" },
  { key: "journey_manual", label: "Manual journey follow-up", description: "People paused at a journey step that requires human action.", category: "Journeys" },
  { key: "journey_completed", label: "Journey completed", description: "People who have completed at least one journey.", category: "Journeys" },
  { key: "no_active_journey", label: "No active journey", description: "People who are not currently active, waiting, or paused in a journey.", category: "Journeys" }
];

function within(value: string | null | undefined, days: number, now: number) {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && now - time <= days * DAY_MS;
}

function olderThan(value: string | null | undefined, days: number, now: number) {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && now - time > days * DAY_MS;
}

function analyticsHas(signals: PersonSignals, names: string[], days: number, now: number) {
  return signals.analytics.some((event) => names.includes(event.event_name) && within(event.occurred_at, days, now));
}

function hasActiveJourney(signals: PersonSignals) {
  return ACTIVE_JOURNEY_STATES.some((status) => signals.journeyStatuses.has(status));
}

export function matchesSystemSegment(key: string, person: Person, signals: PersonSignals, now = Date.now()) {
  const activeJourney = hasActiveJourney(signals);
  if (key === "all") return person.status !== "archived";
  if (key === "new_7d") return within(person.first_seen_at, 7, now);
  if (key === "lead") return person.status === "lead";
  if (key === "subscriber") return person.status === "subscriber";
  if (key === "app_user") return person.status === "app_user";
  if (key === "inactive_30d") return olderThan(person.last_seen_at, 30, now) || person.status === "inactive";

  if (key === "active_7d") return within(person.last_seen_at, 7, now);
  if (key === "returning_30d") return olderThan(person.first_seen_at, 7, now) && within(person.last_seen_at, 30, now);
  if (key === "studying_7d") return analyticsHas(signals, ["article_opened", "article_completed", "pathway_started", "pathway_step_completed", "scripture_opened", "topic_opened", "answer_opened", "search_submitted", "search_result_opened"], 7, now);
  if (key === "pathway_30d") return analyticsHas(signals, ["pathway_started"], 30, now);
  if (key === "article_completed_30d") return analyticsHas(signals, ["article_completed"], 30, now);
  if (key === "searchers_30d") return analyticsHas(signals, ["search_submitted"], 30, now);
  if (key === "app_transition_30d") return analyticsHas(signals, ["app_link_clicked"], 30, now);

  if (key === "instagram") return person.source === "instagram" || Boolean(person.instagram_user_id) || signals.identities.has("instagram");
  if (key === "email") return Boolean(person.email) || signals.identities.has("email");
  if (key === "website") return person.source === "website" || signals.identities.has("browser");
  if (key === "app_identity") return signals.identities.has("app") || person.status === "app_user";

  if (key === "unread_inbox") return signals.unreadInbox > 0;
  if (key === "follow_up") return signals.followUpInbox;

  if (key === "in_journey") return activeJourney;
  if (key === "journey_waiting") return signals.journeyStatuses.has("waiting");
  if (key === "journey_manual") return signals.journeyStatuses.has("paused");
  if (key === "journey_completed") return signals.journeyStatuses.has("completed");
  if (key === "no_active_journey") return !activeJourney;
  return false;
}

export function emptyPersonSignals(): PersonSignals {
  return { identities: new Set(), tags: new Set(), journeyStatuses: new Set(), journeyStatusById: new Map(), unreadInbox: 0, followUpInbox: false, analytics: [] };
}

function parseCustomRules(value: unknown): CustomSegmentRule[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const raw = row as { segment_key?: unknown; negate?: unknown };
    const segmentKey = typeof raw.segment_key === "string" ? raw.segment_key.trim() : "";
    return segmentKey ? [{ segment_key: segmentKey, negate: raw.negate === true }] : [];
  }).slice(0, 20);
}

export async function loadSegments() {
  const service = createServiceClient();
  if (!service) return { definitions: [] as SegmentDefinition[], people: [] as SegmentedPerson[], memberIds: new Map<string, Set<string>>(), customSegments: [] as CustomSegmentRecord[] };

  const thirtyDaysAgo = new Date(Date.now() - 30 * DAY_MS).toISOString();
  const [peopleResult, identitiesResult, tagsResult, enrollmentResult, journeysResult, inboxResult, analyticsResult, browserIdentityResult, customResult] = await Promise.all([
    service.from("people").select("*").neq("status", "archived").order("last_seen_at", { ascending: false }).limit(5000),
    service.from("person_identities").select("person_id,provider"),
    service.from("person_tags").select("person_id,tag"),
    service.from("growth_journey_enrollments").select("person_id,journey_id,status,updated_at"),
    service.from("growth_journeys").select("id,name,status").neq("status", "archived").order("name"),
    service.from("inbox_conversations").select("person_id,status,unread_count,last_message_at"),
    service.schema("analytics").from("events").select("person_id,event_name,occurred_at").not("person_id", "is", null).gte("occurred_at", thirtyDaysAgo).limit(10000),
    service.from("person_browser_identities").select("person_id"),
    service.from("custom_segments").select("id,name,description,match_mode,rules,created_at,updated_at").order("updated_at", { ascending: false })
  ]);

  const people = (peopleResult.data ?? []) as Person[];
  const signals = new Map<string, PersonSignals>();
  const ensure = (personId: string) => {
    const current = signals.get(personId) ?? emptyPersonSignals();
    signals.set(personId, current);
    return current;
  };

  for (const row of identitiesResult.data ?? []) ensure(String(row.person_id)).identities.add(String(row.provider));
  for (const row of browserIdentityResult.data ?? []) ensure(String(row.person_id)).identities.add("browser");
  for (const row of tagsResult.data ?? []) ensure(String(row.person_id)).tags.add(String(row.tag));
  for (const row of enrollmentResult.data ?? []) {
    const current = ensure(String(row.person_id));
    const journeyId = String(row.journey_id);
    const status = String(row.status);
    current.journeyStatuses.add(status);
    const journeyStatuses = current.journeyStatusById.get(journeyId) ?? new Set<string>();
    journeyStatuses.add(status);
    current.journeyStatusById.set(journeyId, journeyStatuses);
  }
  for (const row of inboxResult.data ?? []) {
    const current = ensure(String(row.person_id));
    current.unreadInbox += Number(row.unread_count ?? 0);
    if (row.status === "follow_up") current.followUpInbox = true;
  }
  for (const row of analyticsResult.data ?? []) {
    if (!row.person_id) continue;
    ensure(String(row.person_id)).analytics.push({ event_name: String(row.event_name), occurred_at: String(row.occurred_at) });
  }

  const memberIds = new Map<string, Set<string>>();
  const now = Date.now();
  for (const definition of SYSTEM_SEGMENTS) {
    const ids = new Set<string>();
    for (const person of people) if (matchesSystemSegment(definition.key, person, ensure(person.id), now)) ids.add(person.id);
    memberIds.set(definition.key, ids);
  }

  const tagCounts = new Map<string, Set<string>>();
  for (const [personId, current] of signals.entries()) {
    for (const tag of current.tags) {
      const ids = tagCounts.get(tag) ?? new Set<string>();
      ids.add(personId);
      tagCounts.set(tag, ids);
    }
  }
  const interestDefinitions: SegmentDefinition[] = [...tagCounts.entries()]
    .sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]))
    .map(([tag, ids]) => {
      const key = `tag:${tag}`;
      memberIds.set(key, ids);
      return { key, label: tag, description: `People explicitly tagged “${tag}”.`, category: "Interests", count: ids.size, dynamic: true };
    });

  const journeyRows = (journeysResult.data ?? []) as JourneyRow[];
  const journeyDefinitions: SegmentDefinition[] = journeyRows.map((journey) => {
    const ids = new Set<string>();
    for (const [personId, current] of signals.entries()) {
      const statuses = current.journeyStatusById.get(journey.id);
      if (statuses && ACTIVE_JOURNEY_STATES.some((status) => statuses.has(status))) ids.add(personId);
    }
    const key = `journey:${journey.id}`;
    memberIds.set(key, ids);
    return { key, label: journey.name, description: "People currently active, waiting, or paused in this journey.", category: "Journeys", count: ids.size, dynamic: true };
  });

  const customSegments: CustomSegmentRecord[] = (customResult.data ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    description: row.description ? String(row.description) : null,
    match_mode: row.match_mode === "any" ? "any" : "all",
    rules: parseCustomRules(row.rules),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at)
  }));

  const systemDefinitions = SYSTEM_SEGMENTS.map((definition) => ({ ...definition, count: memberIds.get(definition.key)?.size ?? 0 }));
  const baseDefinitions = [...systemDefinitions, ...journeyDefinitions, ...interestDefinitions];
  const customDefinitions: SegmentDefinition[] = customSegments.map((segment) => {
    const ids = new Set<string>();
    for (const person of people) if (evaluateSegmentRuleSet(person.id, memberIds, segment.match_mode, segment.rules)) ids.add(person.id);
    const key = `custom:${segment.id}`;
    memberIds.set(key, ids);
    return {
      key,
      label: segment.name,
      description: segment.description || `${segment.match_mode === "all" ? "All" : "Any"} of ${segment.rules.length} saved conditions.`,
      category: "Custom",
      count: ids.size,
      dynamic: true,
      customId: segment.id
    };
  });

  const definitions = [...customDefinitions, ...baseDefinitions];
  const segmentedPeople: SegmentedPerson[] = people.map((person) => {
    const current = ensure(person.id);
    const activeJourneyCount = [...current.journeyStatusById.values()].filter((statuses) => ACTIVE_JOURNEY_STATES.some((status) => statuses.has(status))).length;
    return {
      ...person,
      tags: [...current.tags].sort(),
      identityProviders: [...current.identities].sort(),
      activeJourneyCount,
      unreadCount: current.unreadInbox
    };
  });

  return { definitions, people: segmentedPeople, memberIds, customSegments };
}

export function segmentMembers(data: Awaited<ReturnType<typeof loadSegments>>, key: string) {
  const ids = data.memberIds.get(key) ?? new Set<string>();
  return data.people.filter((person) => ids.has(person.id));
}
