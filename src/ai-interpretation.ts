import type { IntelligenceSignal, StudioIntelligenceSnapshot } from "./intelligence-engine";

export type AIContextMode = "aggregate" | "content_discovery";

export type AIInterpretationContext = {
  schemaVersion: "apostolic-guide-intelligence-v1";
  generatedAt: string;
  mode: AIContextMode;
  policy: {
    deterministicSourceOfTruth: true;
    mayRephrase: true;
    maySuggest: true;
    mayInventMetrics: false;
    mayOverrideRules: false;
    containsPrivateMessageBodies: false;
    containsPrivateNotes: false;
    containsDirectIdentifiers: false;
    containsUserAuthoredSearchText: boolean;
  };
  metrics: StudioIntelligenceSnapshot["metrics"];
  trends: StudioIntelligenceSnapshot["trends"];
  contentGaps: StudioIntelligenceSnapshot["contentGaps"];
  risingSearches: StudioIntelligenceSnapshot["risingSearches"];
  signals: Array<Pick<IntelligenceSignal, "ruleId" | "category" | "priority" | "title" | "summary" | "evidence" | "action">>;
  study: {
    pathways: Array<{ slug: string; title: string; uniqueSessions: number; averageProgress: number; reachedFinalStep: number; appTransitions: number }>;
    articles: Array<{ slug: string; title: string; uniqueSessions: number; completionRate: number; appTransitions: number }>;
  };
};

export type AIInterpretation = {
  mode: "ai" | "deterministic";
  provider: string | null;
  summary: string;
  observations: string[];
  suggestions: string[];
};

export type AIInterpretationProvider = {
  name: string;
  interpret(context: AIInterpretationContext): Promise<Omit<AIInterpretation, "mode" | "provider">>;
};

function safeSignalForAI(signal: IntelligenceSignal, includeSearchText: boolean) {
  const searchRule = signal.ruleId === "content.rising_exact_search" || signal.ruleId === "content.search_gaps";
  if (!searchRule || includeSearchText) {
    return {
      ruleId: signal.ruleId,
      category: signal.category,
      priority: signal.priority,
      title: signal.title,
      summary: signal.summary,
      evidence: signal.evidence,
      action: signal.action
    };
  }
  return {
    ruleId: signal.ruleId,
    category: signal.category,
    priority: signal.priority,
    title: signal.ruleId === "content.search_gaps" ? "Search coverage gaps are present" : "Search interest is rising",
    summary: "Exact user-authored search text is withheld in aggregate AI context. Use content_discovery mode only when semantic analysis of search language is explicitly needed.",
    evidence: signal.evidence,
    action: signal.action
  };
}

export function buildAIInterpretationContext(snapshot: StudioIntelligenceSnapshot, mode: AIContextMode = "aggregate"): AIInterpretationContext {
  const includeSearchText = mode === "content_discovery";
  return {
    schemaVersion: "apostolic-guide-intelligence-v1",
    generatedAt: snapshot.generatedAt,
    mode,
    policy: {
      deterministicSourceOfTruth: true,
      mayRephrase: true,
      maySuggest: true,
      mayInventMetrics: false,
      mayOverrideRules: false,
      containsPrivateMessageBodies: false,
      containsPrivateNotes: false,
      containsDirectIdentifiers: false,
      containsUserAuthoredSearchText: includeSearchText
    },
    metrics: snapshot.metrics,
    trends: snapshot.trends,
    contentGaps: includeSearchText ? snapshot.contentGaps : [],
    risingSearches: includeSearchText ? snapshot.risingSearches : [],
    signals: snapshot.signals.slice(0, 20).map((signal) => safeSignalForAI(signal, includeSearchText)),
    study: {
      pathways: snapshot.pathwayIntelligence.slice(0, 12).map((row) => ({ slug: row.slug, title: row.title, uniqueSessions: row.uniqueSessions, averageProgress: row.averageProgress, reachedFinalStep: row.reachedFinalStep, appTransitions: row.appTransitions })),
      articles: snapshot.articleIntelligence.slice(0, 12).map((row) => ({ slug: row.slug, title: row.title, uniqueSessions: row.uniqueSessions, completionRate: row.completionRate, appTransitions: row.appTransitions }))
    }
  };
}

function deterministicInterpretation(snapshot: StudioIntelligenceSnapshot): AIInterpretation {
  const top = snapshot.signals.slice(0, 5);
  const urgent = snapshot.signals.filter((signal) => signal.priority === "urgent").length;
  const high = snapshot.signals.filter((signal) => signal.priority === "high").length;
  const summary = top.length
    ? `${urgent + high} high-priority ${urgent + high === 1 ? "item needs" : "items need"} attention. ${snapshot.metrics.studySessions7d} study sessions and ${snapshot.metrics.searches7d} searches were observed in the last 7 days.`
    : `No rule-based warnings are active. ${snapshot.metrics.studySessions7d} study sessions and ${snapshot.metrics.searches7d} searches were observed in the last 7 days.`;

  return {
    mode: "deterministic",
    provider: null,
    summary,
    observations: top.map((signal) => signal.title),
    suggestions: top.filter((signal) => signal.action).map((signal) => `${signal.action?.label}: ${signal.summary}`)
  };
}

export async function interpretStudioIntelligence(snapshot: StudioIntelligenceSnapshot, provider?: AIInterpretationProvider | null, contextMode: AIContextMode = "aggregate"): Promise<AIInterpretation> {
  if (!provider) return deterministicInterpretation(snapshot);
  try {
    const result = await provider.interpret(buildAIInterpretationContext(snapshot, contextMode));
    return { mode: "ai", provider: provider.name, ...result };
  } catch {
    return deterministicInterpretation(snapshot);
  }
}
