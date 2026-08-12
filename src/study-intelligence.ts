export type StudyAnalyticsEvent = {
  event_name: string;
  page_path: string;
  session_id: string;
  anonymous_id: string;
  person_id?: string | null;
  properties: Record<string, unknown>;
};

export type PathwayCatalogItem = { slug: string; title: string; stepCount: number };
export type ArticleCatalogItem = { slug: string; title: string };

export type PathwayIntelligenceRow = {
  slug: string;
  title: string;
  starts: number;
  audioStarts: number;
  uniqueSessions: number;
  observedSteps: number;
  reachedFinalStep: number;
  completions: number;
  readingCompletions: number;
  audioCompletions: number;
  knownCompleters: number;
  completionRate: number;
  averageProgress: number;
  appTransitions: number;
};

export type ArticleIntelligenceRow = {
  slug: string;
  title: string;
  opens: number;
  uniqueSessions: number;
  completions: number;
  completionRate: number;
  appTransitions: number;
};

function numberProperty(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function stringProperty(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function contentKey(event: StudyAnalyticsEvent) {
  const explicit = stringProperty(event.properties?.contentKey) ?? stringProperty(event.properties?.pathwaySlug);
  if (explicit) return explicit;
  const path = event.page_path.split("?")[0];
  const match = path.match(/^\/pathways\/([^/]+)/);
  return match?.[1] ?? null;
}

function completionMethod(event: StudyAnalyticsEvent, stepCountFallback: number): "reading" | "audio" | null {
  if (event.event_name === "audio_completed") return "audio";
  if (event.event_name === "pathway_completed") {
    const method = stringProperty(event.properties?.completionMethod);
    return method === "audio" ? "audio" : method === "reading" ? "reading" : null;
  }
  if (event.event_name !== "pathway_step_completed") return null;
  const stepNumber = numberProperty(event.properties?.stepNumber) ?? ((numberProperty(event.properties?.stepIndex) ?? -1) + 1);
  const stepCount = Math.max(1, numberProperty(event.properties?.stepCount) ?? stepCountFallback);
  return stepNumber >= stepCount ? "reading" : null;
}

export function buildPathwayIntelligence(events: StudyAnalyticsEvent[], catalog: PathwayCatalogItem[]) {
  const rows: PathwayIntelligenceRow[] = [];
  for (const pathway of catalog) {
    const pathwayEvents = events.filter((event) => contentKey(event) === pathway.slug);
    const starts = pathwayEvents.filter((event) => event.event_name === "pathway_started");
    const audioStarts = pathwayEvents.filter((event) => event.event_name === "audio_started");
    const steps = pathwayEvents.filter((event) => event.event_name === "pathway_step_completed");
    const relevantStudyEvents = pathwayEvents.filter((event) => [
      "pathway_started", "pathway_step_completed", "pathway_completed", "audio_started", "audio_progress", "audio_completed"
    ].includes(event.event_name));
    const relevantSessions = new Set(relevantStudyEvents.map((event) => event.session_id));
    const startSessions = new Set([...starts, ...audioStarts].map((event) => event.session_id));
    const progressBySession = new Map<string, number>();
    const finalSessions = new Set<string>();
    const completionSessions = new Set<string>();
    const readingCompletionSessions = new Set<string>();
    const audioCompletionSessions = new Set<string>();
    const knownCompleters = new Set<string>();

    for (const event of relevantStudyEvents) {
      const method = completionMethod(event, pathway.stepCount);
      if (method) {
        completionSessions.add(event.session_id);
        if (method === "reading") readingCompletionSessions.add(event.session_id);
        if (method === "audio") audioCompletionSessions.add(event.session_id);
        if (event.person_id) knownCompleters.add(event.person_id);
        progressBySession.set(event.session_id, 1);
      }

      if (event.event_name === "pathway_step_completed") {
        const stepNumber = numberProperty(event.properties?.stepNumber) ?? ((numberProperty(event.properties?.stepIndex) ?? -1) + 1);
        const stepCount = Math.max(1, numberProperty(event.properties?.stepCount) ?? pathway.stepCount);
        if (stepNumber > 0) {
          const progress = Math.min(1, stepNumber / stepCount);
          progressBySession.set(event.session_id, Math.max(progressBySession.get(event.session_id) ?? 0, progress));
          if (stepNumber >= stepCount) finalSessions.add(event.session_id);
        }
      }

      if (event.event_name === "audio_progress") {
        const position = numberProperty(event.properties?.positionSeconds);
        const duration = numberProperty(event.properties?.durationSeconds);
        if (position !== null && duration !== null && duration > 0) {
          const progress = Math.max(0, Math.min(1, position / duration));
          progressBySession.set(event.session_id, Math.max(progressBySession.get(event.session_id) ?? 0, progress));
        }
      }
    }

    const denominatorSessions = startSessions.size ? startSessions : relevantSessions;
    const progressValues = Array.from(denominatorSessions).map((sessionId) => progressBySession.get(sessionId) ?? 0);
    const averageProgress = progressValues.length ? Math.round((progressValues.reduce((sum, value) => sum + value, 0) / progressValues.length) * 100) : 0;
    const completionRate = denominatorSessions.size ? Math.min(100, Math.round((completionSessions.size / denominatorSessions.size) * 100)) : 0;
    const appTransitions = events.filter((event) => {
      if (event.event_name !== "app_link_clicked") return false;
      const origin = event.properties?.origin;
      return origin === `website-pathway-${pathway.slug}` || event.page_path.split("?")[0] === `/pathways/${pathway.slug}`;
    }).length;

    if (relevantStudyEvents.length || appTransitions) {
      rows.push({
        slug: pathway.slug,
        title: pathway.title,
        starts: starts.length,
        audioStarts: audioStarts.length,
        uniqueSessions: denominatorSessions.size,
        observedSteps: steps.length,
        reachedFinalStep: finalSessions.size,
        completions: completionSessions.size,
        readingCompletions: readingCompletionSessions.size,
        audioCompletions: audioCompletionSessions.size,
        knownCompleters: knownCompleters.size,
        completionRate,
        averageProgress,
        appTransitions
      });
    }
  }
  return rows.sort((a, b) => b.starts - a.starts || b.audioStarts - a.audioStarts || b.completions - a.completions || b.observedSteps - a.observedSteps || b.appTransitions - a.appTransitions);
}

export function buildArticleIntelligence(events: StudyAnalyticsEvent[], catalog: ArticleCatalogItem[]) {
  const rows: ArticleIntelligenceRow[] = [];
  for (const article of catalog) {
    const opens = events.filter((event) => event.event_name === "article_opened" && contentKey(event) === article.slug);
    const completions = events.filter((event) => event.event_name === "article_completed" && contentKey(event) === article.slug);
    const openSessions = new Set(opens.map((event) => event.session_id));
    const completionSessions = new Set(completions.map((event) => event.session_id));
    const appTransitions = events.filter((event) => event.event_name === "app_link_clicked" && event.page_path.split("?")[0] === `/articles/${article.slug}`).length;
    if (opens.length || completions.length || appTransitions) {
      rows.push({
        slug: article.slug,
        title: article.title,
        opens: opens.length,
        uniqueSessions: openSessions.size,
        completions: completionSessions.size,
        completionRate: openSessions.size ? Math.round((completionSessions.size / openSessions.size) * 100) : 0,
        appTransitions
      });
    }
  }
  return rows.sort((a, b) => b.opens - a.opens || b.completions - a.completions || b.appTransitions - a.appTransitions);
}
