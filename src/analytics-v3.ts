export type AnalyticsV3PeriodMetrics = {
  pageViews: number;
  visitors: number;
  sessions: number;
  newVisitors: number;
  returningVisitors: number;
  engagedStudySessions: number;
  pathwayStartSessions: number;
  pathwayCompletionSessions: number;
  appTransitionSessions: number;
  searchSessions: number;
  noResultSearchSessions: number;
};

export type AnalyticsV3AcquisitionRow = {
  source: string;
  sessions: number;
  priorSessions: number;
  engagedSessions: number;
  completionSessions: number;
  appSessions: number;
  studyRate: number;
  completionRate: number;
  appRate: number;
};

export type AnalyticsV3PathwayRow = {
  slug: string;
  starts: number;
  reach25: number;
  reach50: number;
  reach75: number;
  completions: number;
  completionRate: number;
  averageProgress: number;
  priorStarts: number;
  priorCompletions: number;
};

export type AnalyticsV3DailyRow = {
  date: string;
  pageViews: number;
  visitors: number;
  sessions: number;
  engagedStudySessions: number;
  pathwayStarts: number;
  pathwayCompletions: number;
  appTransitions: number;
};

export type AnalyticsV3QualityRow = {
  label: string;
  sessions: number;
  engagedSessions: number;
  completionSessions: number;
  appSessions: number;
  studyRate: number;
  completionRate: number;
  appRate: number;
};

export type AnalyticsV3SearchRow = { query: string; count: number };
export type AnalyticsV3CountRow = { label: string; count: number };

export type AnalyticsV3Snapshot = {
  schemaVersion: 3;
  generatedAt: string;
  period: {
    currentStart: string;
    currentEnd: string;
    previousStart: string;
    previousEnd: string;
    trackingDays: number;
    trendReady: boolean;
    current: AnalyticsV3PeriodMetrics;
    previous: AnalyticsV3PeriodMetrics;
  };
  acquisition: AnalyticsV3AcquisitionRow[];
  pathways: AnalyticsV3PathwayRow[];
  daily: AnalyticsV3DailyRow[];
  devices: AnalyticsV3QualityRow[];
  countries: AnalyticsV3QualityRow[];
  searches: AnalyticsV3SearchRow[];
  searchGaps: AnalyticsV3SearchRow[];
  topPages: AnalyticsV3CountRow[];
  campaigns: AnalyticsV3CountRow[];
  internalSessionsExcluded: number;
};

export type AnalyticsV3Comparison = {
  current: number;
  previous: number;
  absolute: number;
  percent: number | null;
  direction: "up" | "down" | "flat" | "new";
};

export type AnalyticsV3Confidence = "strong" | "moderate" | "early";

export type AnalyticsV3Signal = {
  id: string;
  severity: "attention" | "opportunity" | "positive" | "info";
  title: string;
  detail: string;
  confidence: AnalyticsV3Confidence;
  evidence: Array<{ label: string; value: string }>;
  href?: string;
};

export type PathwayCollectionInput = AnalyticsV3PathwayRow & {
  title: string;
  collection: string;
};

export type PathwayCollectionRollup = {
  collection: string;
  starts: number;
  completions: number;
  completionRate: number;
  weightedAverageProgress: number;
  activePathways: number;
};

export function analyticsRate(part: number, total: number) {
  if (!total || total < 0) return 0;
  return Math.min(100, Math.max(0, Math.round((part / total) * 100)));
}

export function compareAnalyticsMetric(current: number, previous: number): AnalyticsV3Comparison {
  const absolute = current - previous;
  if (previous === 0) {
    return {
      current,
      previous,
      absolute,
      percent: current === 0 ? 0 : null,
      direction: current === 0 ? "flat" : "new"
    };
  }
  const percent = Math.round((absolute / previous) * 100);
  return {
    current,
    previous,
    absolute,
    percent,
    direction: absolute > 0 ? "up" : absolute < 0 ? "down" : "flat"
  };
}

export function analyticsConfidence(sample: number): AnalyticsV3Confidence {
  if (sample >= 50) return "strong";
  if (sample >= 15) return "moderate";
  return "early";
}

export function formatAnalyticsComparison(comparison: AnalyticsV3Comparison) {
  if (comparison.direction === "new") return `${comparison.current} vs 0 · new activity`;
  const absolute = `${comparison.absolute >= 0 ? "+" : ""}${comparison.absolute}`;
  const percent = `${comparison.percent && comparison.percent > 0 ? "+" : ""}${comparison.percent ?? 0}%`;
  return `${comparison.current} vs ${comparison.previous} · ${absolute} · ${percent}`;
}

export function rollupPathwayCollections(rows: PathwayCollectionInput[]): PathwayCollectionRollup[] {
  const map = new Map<string, { starts: number; completions: number; progressWeighted: number; activePathways: number }>();
  for (const row of rows) {
    const current = map.get(row.collection) ?? { starts: 0, completions: 0, progressWeighted: 0, activePathways: 0 };
    current.starts += row.starts;
    current.completions += row.completions;
    current.progressWeighted += row.averageProgress * row.starts;
    if (row.starts > 0) current.activePathways += 1;
    map.set(row.collection, current);
  }
  return Array.from(map.entries()).map(([collection, value]) => ({
    collection,
    starts: value.starts,
    completions: value.completions,
    completionRate: analyticsRate(value.completions, value.starts),
    weightedAverageProgress: value.starts ? Math.round(value.progressWeighted / value.starts) : 0,
    activePathways: value.activePathways
  })).sort((a, b) => b.starts - a.starts || a.collection.localeCompare(b.collection));
}

export function buildAnalyticsV3Signals(snapshot: AnalyticsV3Snapshot, pathwayRows: PathwayCollectionInput[]): AnalyticsV3Signal[] {
  const signals: AnalyticsV3Signal[] = [];
  const current = snapshot.period.current;
  const previous = snapshot.period.previous;
  const visitorChange = compareAnalyticsMetric(current.visitors, previous.visitors);
  const studyChange = compareAnalyticsMetric(current.engagedStudySessions, previous.engagedStudySessions);

  if (snapshot.period.trendReady && visitorChange.direction !== "flat") {
    signals.push({
      id: "traffic-change",
      severity: visitorChange.direction === "down" ? "attention" : "positive",
      title: visitorChange.direction === "down" ? "Public traffic is down" : "Public traffic is growing",
      detail: formatAnalyticsComparison(visitorChange),
      confidence: analyticsConfidence(current.visitors + previous.visitors),
      evidence: [
        { label: "Current visitors", value: String(current.visitors) },
        { label: "Prior visitors", value: String(previous.visitors) }
      ]
    });
  }

  if (snapshot.period.trendReady && studyChange.direction !== "flat") {
    signals.push({
      id: "study-change",
      severity: studyChange.direction === "down" ? "attention" : "positive",
      title: studyChange.direction === "down" ? "Meaningful study activity declined" : "Meaningful study activity increased",
      detail: formatAnalyticsComparison(studyChange),
      confidence: analyticsConfidence(current.engagedStudySessions + previous.engagedStudySessions),
      evidence: [
        { label: "Current engaged studies", value: String(current.engagedStudySessions) },
        { label: "Prior engaged studies", value: String(previous.engagedStudySessions) }
      ]
    });
  }

  const acquisitionGrowth = snapshot.acquisition
    .filter((row) => row.sessions >= 3 && row.sessions > row.priorSessions)
    .sort((a, b) => (b.sessions - b.priorSessions) - (a.sessions - a.priorSessions))[0];
  if (acquisitionGrowth) {
    const delta = acquisitionGrowth.sessions - acquisitionGrowth.priorSessions;
    signals.push({
      id: `source-growth:${acquisitionGrowth.source}`,
      severity: acquisitionGrowth.studyRate >= analyticsRate(current.engagedStudySessions, current.sessions) ? "opportunity" : "info",
      title: `${acquisitionGrowth.source} added the most session growth`,
      detail: `${acquisitionGrowth.sessions} sessions this period versus ${acquisitionGrowth.priorSessions} before, a gain of ${delta}. ${acquisitionGrowth.studyRate}% of current sessions reached meaningful study.`,
      confidence: analyticsConfidence(acquisitionGrowth.sessions + acquisitionGrowth.priorSessions),
      evidence: [
        { label: "Current sessions", value: String(acquisitionGrowth.sessions) },
        { label: "Prior sessions", value: String(acquisitionGrowth.priorSessions) },
        { label: "Study rate", value: `${acquisitionGrowth.studyRate}%` }
      ]
    });
  }

  const highTrafficWeakCompletion = pathwayRows
    .filter((row) => row.starts >= 5 && row.completionRate < 25)
    .sort((a, b) => b.starts - a.starts)[0];
  if (highTrafficWeakCompletion) {
    signals.push({
      id: `pathway-dropoff:${highTrafficWeakCompletion.slug}`,
      severity: "attention",
      title: `${highTrafficWeakCompletion.title} is attracting starts but losing readers`,
      detail: `${highTrafficWeakCompletion.starts} started and ${highTrafficWeakCompletion.completions} completed. The completion rate is ${highTrafficWeakCompletion.completionRate}% with ${highTrafficWeakCompletion.averageProgress}% average depth.`,
      confidence: analyticsConfidence(highTrafficWeakCompletion.starts),
      evidence: [
        { label: "Starts", value: String(highTrafficWeakCompletion.starts) },
        { label: "Completions", value: String(highTrafficWeakCompletion.completions) },
        { label: "Average depth", value: `${highTrafficWeakCompletion.averageProgress}%` }
      ],
      href: `/pathways/${highTrafficWeakCompletion.slug}`
    });
  }

  const deepUnderdistributed = pathwayRows
    .filter((row) => row.starts >= 3 && row.starts < 20 && row.completionRate >= 50)
    .sort((a, b) => b.completionRate - a.completionRate || b.starts - a.starts)[0];
  if (deepUnderdistributed) {
    signals.push({
      id: `pathway-opportunity:${deepUnderdistributed.slug}`,
      severity: "opportunity",
      title: `${deepUnderdistributed.title} is small but unusually deep`,
      detail: `${deepUnderdistributed.completions} of ${deepUnderdistributed.starts} starts completed (${deepUnderdistributed.completionRate}%). It may deserve more distribution.`,
      confidence: analyticsConfidence(deepUnderdistributed.starts),
      evidence: [
        { label: "Starts", value: String(deepUnderdistributed.starts) },
        { label: "Completion rate", value: `${deepUnderdistributed.completionRate}%` }
      ],
      href: `/pathways/${deepUnderdistributed.slug}`
    });
  }

  const topGap = snapshot.searchGaps[0];
  if (topGap?.count >= 2) {
    signals.push({
      id: `search-gap:${topGap.query}`,
      severity: "opportunity",
      title: `Search demand is not fully covered: ${topGap.query}`,
      detail: `${topGap.count} no-result searches in the current period. This is a direct content or search-index candidate.`,
      confidence: analyticsConfidence(snapshot.period.current.searchSessions),
      evidence: [
        { label: "No-result searches", value: String(topGap.count) },
        { label: "Search sessions", value: String(snapshot.period.current.searchSessions) }
      ]
    });
  }

  return signals.slice(0, 8);
}

export function buildDeterministicAnalyticsBrief(snapshot: AnalyticsV3Snapshot, signals: AnalyticsV3Signal[]) {
  const current = snapshot.period.current;
  const previous = snapshot.period.previous;
  const traffic = compareAnalyticsMetric(current.visitors, previous.visitors);
  const study = compareAnalyticsMetric(current.engagedStudySessions, previous.engagedStudySessions);
  const lead = snapshot.period.trendReady
    ? `Public visitors were ${formatAnalyticsComparison(traffic)}. Engaged study sessions were ${formatAnalyticsComparison(study)}.`
    : `${current.visitors} public visitors and ${current.engagedStudySessions} engaged study sessions were recorded in the current seven-day window while the comparison baseline is still collecting.`;
  return {
    summary: lead,
    observations: signals.slice(0, 4).map((item) => item.title),
    recommendation: signals.find((item) => item.severity === "attention" || item.severity === "opportunity")?.detail ?? "Keep collecting clean first-party data before making a larger optimization decision."
  };
}
