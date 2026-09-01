import "server-only";
import { createServiceClient } from "./supabase";
import type { AnalyticsV3Snapshot } from "./analytics-v3";

export type LegacyArticleAnalyticsRow = {
  slug: string;
  opens: number;
  uniqueSessions: number;
  completions: number;
  completionRate: number;
  appTransitions: number;
};

type V2FallbackSnapshot = {
  metrics?: Record<string, number | null | boolean>;
  acquisition?: Array<Record<string, string | number>>;
  pathwayFunnel?: Array<Record<string, string | number>>;
};

type AnalyticsRpcPayload = {
  v2?: V2FallbackSnapshot;
  v3?: AnalyticsV3Snapshot;
  articles?: LegacyArticleAnalyticsRow[];
};

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function emptyMetrics() {
  return {
    pageViews: 0,
    visitors: 0,
    sessions: 0,
    newVisitors: 0,
    returningVisitors: 0,
    engagedStudySessions: 0,
    pathwayStartSessions: 0,
    pathwayCompletionSessions: 0,
    appTransitionSessions: 0,
    searchSessions: 0,
    noResultSearchSessions: 0
  };
}

function fallbackFromV2(payload: AnalyticsRpcPayload): AnalyticsV3Snapshot {
  const metrics = payload.v2?.metrics ?? {};
  const current = {
    pageViews: number(metrics.weekly_page_views),
    visitors: number(metrics.weekly_visitors),
    sessions: number(metrics.weekly_sessions),
    newVisitors: number(metrics.weekly_new_browsers),
    returningVisitors: number(metrics.weekly_returning_browsers),
    engagedStudySessions: number(metrics.weekly_engaged_study_sessions),
    pathwayStartSessions: number(metrics.weekly_pathway_start_sessions),
    pathwayCompletionSessions: number(metrics.weekly_pathway_completion_sessions),
    appTransitionSessions: number(metrics.weekly_app_transition_sessions),
    searchSessions: number(metrics.search_sessions),
    noResultSearchSessions: number(metrics.search_no_result_sessions)
  };
  const previous = emptyMetrics();
  previous.engagedStudySessions = number(metrics.prior_week_engaged_study_sessions);
  return {
    schemaVersion: 3,
    generatedAt: new Date().toISOString(),
    period: {
      currentStart: new Date(Date.now() - 7 * 86_400_000).toISOString(),
      currentEnd: new Date().toISOString(),
      previousStart: new Date(Date.now() - 14 * 86_400_000).toISOString(),
      previousEnd: new Date(Date.now() - 7 * 86_400_000).toISOString(),
      trackingDays: number(metrics.tracking_days),
      // V2 does not expose enough prior-period metrics for a fair full V3 comparison.
      trendReady: false,
      current,
      previous
    },
    acquisition: (payload.v2?.acquisition ?? []).map((row) => ({
      source: String(row.source ?? "Unknown"),
      sessions: number(row.sessions),
      priorSessions: 0,
      engagedSessions: number(row.engagedSessions),
      completionSessions: number(row.completionSessions),
      appSessions: number(row.appSessions),
      studyRate: number(row.studyRate),
      completionRate: number(row.completionRate),
      appRate: number(row.appRate)
    })),
    pathways: (payload.v2?.pathwayFunnel ?? []).map((row) => ({
      slug: String(row.slug ?? ""),
      starts: number(row.starts),
      reach25: number(row.reach25),
      reach50: number(row.reach50),
      reach75: number(row.reach75),
      completions: number(row.completions),
      completionRate: number(row.completionRate),
      averageProgress: number(row.averageProgress),
      priorStarts: 0,
      priorCompletions: 0
    })).filter((row) => row.slug),
    daily: [],
    devices: [],
    countries: [],
    searches: [],
    searchGaps: [],
    topPages: [],
    campaigns: [],
    internalSessionsExcluded: number(metrics.weekly_internal_sessions)
  };
}

export async function loadAnalyticsV3() {
  const service = createServiceClient();
  if (!service) return { snapshot: null as AnalyticsV3Snapshot | null, articles: [] as LegacyArticleAnalyticsRow[], fallback: false, error: "Supabase service access is not configured." };

  const v3 = await service.schema("analytics").rpc("dashboard_snapshot_v3");
  if (!v3.error && v3.data) {
    const payload = v3.data as AnalyticsRpcPayload;
    return {
      snapshot: payload.v3 ?? null,
      articles: payload.articles ?? [],
      fallback: false,
      error: payload.v3 ? null : "Analytics V3 returned no decision snapshot."
    };
  }

  const v2 = await service.schema("analytics").rpc("dashboard_snapshot_v2");
  if (v2.error || !v2.data) {
    return {
      snapshot: null as AnalyticsV3Snapshot | null,
      articles: [] as LegacyArticleAnalyticsRow[],
      fallback: false,
      error: v3.error?.message || v2.error?.message || "Analytics snapshot is unavailable."
    };
  }
  const payload = v2.data as AnalyticsRpcPayload;
  return { snapshot: fallbackFromV2(payload), articles: payload.articles ?? [], fallback: true, error: null };
}
