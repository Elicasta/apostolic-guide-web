export type RelationshipWebsiteEvent = {
  eventName: string;
  at: string;
  pagePath?: string | null;
  contentKey?: string | null;
};

export type RelationshipJourney = {
  id: string;
  name: string;
  status: string;
};

export type RelationshipInbox = {
  id: string;
  status: string;
  unreadCount: number;
  lastInboundAt?: string | null;
  lastOutboundAt?: string | null;
} | null;

export type RelationshipIntelligence = {
  state: "follow_up" | "studying" | "engaged" | "quiet";
  headline: string;
  summary: string;
  interests: string[];
  signals: Array<{ label: string; value: string }>;
  nextAction: { label: string; href: string; reason: string };
};

const studyEventNames = new Set([
  "article_opened",
  "article_completed",
  "pathway_started",
  "pathway_step_completed",
  "scripture_opened",
  "search_submitted",
  "search_result_opened",
  "topic_opened",
  "answer_opened"
]);

function daysAgo(date: string, now: Date) {
  const time = new Date(date).getTime();
  if (!Number.isFinite(time)) return Number.POSITIVE_INFINITY;
  return (now.getTime() - time) / 86_400_000;
}

function humanize(value: string) {
  return value.replace(/^@/, "").replaceAll("-", " ").replaceAll("_", " ").replace(/\s+/g, " ").trim();
}

function interestFromPath(path?: string | null) {
  if (!path) return null;
  const clean = path.split("?")[0];
  const match = clean.match(/^\/(?:articles|pathways|topics|answers)\/([^/]+)/);
  return match?.[1] ? humanize(match[1]) : null;
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, (char) => char.toUpperCase());
}

export function buildRelationshipIntelligence(input: {
  personStatus: string;
  lastSeenAt: string;
  tags: string[];
  websiteEvents: RelationshipWebsiteEvent[];
  journeys: RelationshipJourney[];
  inbox: RelationshipInbox;
  now?: Date;
}): RelationshipIntelligence {
  const now = input.now ?? new Date();
  const recent7 = input.websiteEvents.filter((event) => daysAgo(event.at, now) <= 7);
  const recent30 = input.websiteEvents.filter((event) => daysAgo(event.at, now) <= 30);
  const study7 = recent7.filter((event) => studyEventNames.has(event.eventName));
  const study30 = recent30.filter((event) => studyEventNames.has(event.eventName));
  const activeJourney = input.journeys.find((journey) => ["active", "waiting", "paused"].includes(journey.status));
  const unread = input.inbox?.unreadCount ?? 0;
  const explicitFollowUp = input.inbox?.status === "follow_up" || input.journeys.some((journey) => journey.status === "paused");

  const interestCandidates = [
    ...input.tags.map((tag) => humanize(tag)),
    ...study30.flatMap((event) => [event.contentKey ? humanize(event.contentKey) : null, interestFromPath(event.pagePath)])
  ].filter((value): value is string => Boolean(value && value.length > 1));
  const interests = Array.from(new Set(interestCandidates.map((value) => titleCase(value)))).slice(0, 4);

  let state: RelationshipIntelligence["state"] = "quiet";
  let headline = "Quiet relationship";
  if (unread > 0 || explicitFollowUp) {
    state = "follow_up";
    headline = "Follow-up needed";
  } else if (study7.length >= 2 || recent7.some((event) => event.eventName === "pathway_started")) {
    state = "studying";
    headline = "Actively studying";
  } else if (recent7.length > 0 || daysAgo(input.lastSeenAt, now) <= 7) {
    state = "engaged";
    headline = "Recently active";
  }

  const summaryParts: string[] = [];
  if (unread > 0) summaryParts.push(`${unread} unread Inbox ${unread === 1 ? "message is" : "messages are"} waiting`);
  if (study7.length > 0) summaryParts.push(`${study7.length} study ${study7.length === 1 ? "event" : "events"} in the last 7 days`);
  else if (study30.length > 0) summaryParts.push(`${study30.length} study ${study30.length === 1 ? "event" : "events"} in the last 30 days`);
  if (activeJourney) summaryParts.push(`currently in ${activeJourney.name}`);
  if (interests.length) summaryParts.push(`recent interests include ${interests.slice(0, 2).join(" and ")}`);
  if (!summaryParts.length) summaryParts.push("No strong recent relationship signals are recorded yet");
  const summary = `${summaryParts.join("; ")}.`;

  let nextAction: RelationshipIntelligence["nextAction"];
  if (unread > 0 && input.inbox) {
    nextAction = { label: "Open Inbox conversation", href: `/admin/inbox/${input.inbox.id}`, reason: "There is an unread message waiting for a response." };
  } else if (explicitFollowUp && activeJourney) {
    nextAction = { label: "Review current journey", href: `/admin/journeys/${activeJourney.id}`, reason: "The relationship or journey is marked for follow-up." };
  } else if (study7.length > 0 && !activeJourney) {
    nextAction = { label: "Review Journeys", href: "/admin/journeys", reason: "Recent study activity is present but no active journey is assigned." };
  } else if (activeJourney) {
    nextAction = { label: "Open current journey", href: `/admin/journeys/${activeJourney.id}`, reason: "Use the active journey to understand the next planned step." };
  } else {
    nextAction = { label: "Review relationship timeline", href: "#relationship-history", reason: "The timeline has the strongest available evidence for deciding what to do next." };
  }

  const signals = [
    { label: "Study / 7d", value: String(study7.length) },
    { label: "Activity / 30d", value: String(recent30.length) },
    { label: "Inbox", value: unread > 0 ? `${unread} unread` : input.inbox ? input.inbox.status.replaceAll("_", " ") : "none" },
    { label: "Journey", value: activeJourney ? activeJourney.status : "none" }
  ];

  return { state, headline, summary, interests, signals, nextAction };
}
