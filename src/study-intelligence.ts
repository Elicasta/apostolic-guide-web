export type StudyAnalyticsEvent = {
  event_name: string;
  page_path: string;
  session_id: string;
  anonymous_id: string;
  properties: Record<string, unknown>;
};

export type PathwayCatalogItem = { slug: string; title: string; stepCount: number };
export type ArticleCatalogItem = { slug: string; title: string };

export type PathwayIntelligenceRow = {
  slug: string;
  title: string;
  starts: number;
  uniqueSessions: number;
  observedSteps: number;
  reachedFinalStep: number;
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

function contentKey(event: StudyAnalyticsEvent) {
  const key = event.properties?.contentKey;
  return typeof key === "string" && key.trim() ? key.trim() : null;
}

export function buildPathwayIntelligence(events: StudyAnalyticsEvent[], catalog: PathwayCatalogItem[]) {
  const rows: PathwayIntelligenceRow[] = [];
  for (const pathway of catalog) {
    const starts = events.filter((event) => event.event_name === "pathway_started" && contentKey(event) === pathway.slug);
    const steps = events.filter((event) => event.event_name === "pathway_step_completed" && contentKey(event) === pathway.slug);
    const relevantSessions = new Set(starts.map((event) => event.session_id));
    const progressBySession = new Map<string, number>();
    const finalSessions = new Set<string>();

    for (const event of steps) {
      relevantSessions.add(event.session_id);
      const stepNumber = numberProperty(event.properties?.stepNumber) ?? ((numberProperty(event.properties?.stepIndex) ?? -1) + 1);
      const stepCount = Math.max(1, numberProperty(event.properties?.stepCount) ?? pathway.stepCount);
      if (stepNumber > 0) {
        const progress = Math.min(1, stepNumber / stepCount);
        progressBySession.set(event.session_id, Math.max(progressBySession.get(event.session_id) ?? 0, progress));
        if (stepNumber >= stepCount) finalSessions.add(event.session_id);
      }
    }

    const startSessions = new Set(starts.map((event) => event.session_id));
    const denominator = startSessions.size || relevantSessions.size;
    const progressValues = Array.from(startSessions.size ? startSessions : relevantSessions).map((sessionId) => progressBySession.get(sessionId) ?? 0);
    const averageProgress = progressValues.length ? Math.round((progressValues.reduce((sum, value) => sum + value, 0) / progressValues.length) * 100) : 0;
    const appTransitions = events.filter((event) => {
      if (event.event_name !== "app_link_clicked") return false;
      const origin = event.properties?.origin;
      return origin === `website-pathway-${pathway.slug}` || event.page_path.split("?")[0] === `/pathways/${pathway.slug}`;
    }).length;

    if (starts.length || steps.length || appTransitions) {
      rows.push({
        slug: pathway.slug,
        title: pathway.title,
        starts: starts.length,
        uniqueSessions: denominator,
        observedSteps: steps.length,
        reachedFinalStep: finalSessions.size,
        averageProgress,
        appTransitions
      });
    }
  }
  return rows.sort((a, b) => b.starts - a.starts || b.observedSteps - a.observedSteps || b.appTransitions - a.appTransitions);
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
