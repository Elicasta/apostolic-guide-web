import { createServiceClient } from "./supabase";

export type PublicationPlatform = "instagram" | "facebook" | "tiktok" | "youtube";

export type PathwayPublication = {
  id: string;
  pathway_slug: string;
  asset_id: string | null;
  platform: string;
  status: string;
  external_post_id: string | null;
  published_url: string | null;
  published_at: string | null;
  metadata: Record<string, unknown> | null;
};

export type NormalizedPublicationMetrics = {
  views?: number | null;
  impressions?: number | null;
  reach?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  saves?: number | null;
  watchSeconds?: number | null;
  averageViewDurationSeconds?: number | null;
  averageViewPercentage?: number | null;
  subscribersGained?: number | null;
  subscribersLost?: number | null;
  rawMetrics: Record<string, unknown>;
  syncStatus: "success" | "partial" | "failed";
  errorMessage?: string | null;
};

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

async function readIntegrationSecrets(names: string[]) {
  const service = createServiceClient();
  if (!service) return new Map<string, string>();
  const { data } = await service.schema("analytics").from("integration_secrets").select("name,secret").in("name", names);
  return new Map((data ?? []).map((row) => [String(row.name), String(row.secret)]));
}

async function collectYouTube(publication: PathwayPublication): Promise<NormalizedPublicationMetrics> {
  const values = await readIntegrationSecrets(["youtube_access_token"]);
  const accessToken = values.get("youtube_access_token");
  if (!accessToken) return { rawMetrics: {}, syncStatus: "failed", errorMessage: "YouTube access token is not configured." };
  if (!publication.external_post_id) return { rawMetrics: {}, syncStatus: "failed", errorMessage: "YouTube video ID is missing." };

  const startDate = (publication.published_at ? new Date(publication.published_at) : new Date(Date.now() - 30 * 86400000)).toISOString().slice(0, 10);
  const endDate = new Date().toISOString().slice(0, 10);
  const metrics = ["views","likes","comments","shares","estimatedMinutesWatched","averageViewDuration","averageViewPercentage","subscribersGained","subscribersLost"].join(",");
  const params = new URLSearchParams({ ids: "channel==MINE", startDate, endDate, metrics, filters: `video==${publication.external_post_id}` });
  const response = await fetch(`https://youtubeanalytics.googleapis.com/v2/reports?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store"
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) return { rawMetrics: body, syncStatus: "failed", errorMessage: body?.error?.message || `YouTube metrics failed (${response.status}).` };

  const headers = Array.isArray(body?.columnHeaders) ? body.columnHeaders : [];
  const row = Array.isArray(body?.rows?.[0]) ? body.rows[0] : [];
  const raw: Record<string, unknown> = {};
  headers.forEach((header: { name?: string }, index: number) => { if (header?.name) raw[header.name] = row[index]; });
  return {
    views: asNumber(raw.views), likes: asNumber(raw.likes), comments: asNumber(raw.comments), shares: asNumber(raw.shares),
    watchSeconds: (asNumber(raw.estimatedMinutesWatched) ?? 0) * 60,
    averageViewDurationSeconds: asNumber(raw.averageViewDuration), averageViewPercentage: asNumber(raw.averageViewPercentage),
    subscribersGained: asNumber(raw.subscribersGained), subscribersLost: asNumber(raw.subscribersLost), rawMetrics: raw, syncStatus: "success"
  };
}

async function collectTikTok(publication: PathwayPublication): Promise<NormalizedPublicationMetrics> {
  const values = await readIntegrationSecrets(["tiktok_access_token"]);
  const accessToken = values.get("tiktok_access_token");
  if (!accessToken) return { rawMetrics: {}, syncStatus: "failed", errorMessage: "TikTok access token is not configured." };
  if (!publication.external_post_id) return { rawMetrics: {}, syncStatus: "failed", errorMessage: "TikTok video ID is missing." };

  const fields = "id,view_count,like_count,comment_count,share_count";
  const response = await fetch(`https://open.tiktokapis.com/v2/video/query/?fields=${encodeURIComponent(fields)}`, {
    method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ filters: { video_ids: [publication.external_post_id] } }), cache: "no-store"
  });
  const body = await response.json().catch(() => ({}));
  const video = body?.data?.videos?.[0];
  if (!response.ok || !video) return { rawMetrics: body, syncStatus: "failed", errorMessage: body?.error?.message || `TikTok metrics failed (${response.status}).` };
  return { views: asNumber(video.view_count), likes: asNumber(video.like_count), comments: asNumber(video.comment_count), shares: asNumber(video.share_count), rawMetrics: video, syncStatus: "success" };
}

async function collectInstagram(publication: PathwayPublication): Promise<NormalizedPublicationMetrics> {
  const values = await readIntegrationSecrets(["meta_instagram_access_token","meta_instagram_graph_version"]);
  const accessToken = values.get("meta_instagram_access_token");
  const version = values.get("meta_instagram_graph_version") || "v24.0";
  if (!accessToken) return { rawMetrics: {}, syncStatus: "failed", errorMessage: "Instagram access token is not configured." };
  if (!publication.external_post_id) return { rawMetrics: {}, syncStatus: "failed", errorMessage: "Instagram media ID is missing." };

  const baseUrl = `https://graph.instagram.com/${version}/${encodeURIComponent(publication.external_post_id)}`;
  const basicResponse = await fetch(`${baseUrl}?fields=id,like_count,comments_count`, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
  const basic = await basicResponse.json().catch(() => ({}));
  if (!basicResponse.ok) return { rawMetrics: basic, syncStatus: "failed", errorMessage: basic?.error?.message || `Instagram metrics failed (${basicResponse.status}).` };

  const requested = Array.isArray(publication.metadata?.insight_metrics)
    ? publication.metadata.insight_metrics.filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
    : ["views", "reach", "saved", "shares"];
  const insights: Record<string, unknown> = {};
  const failures: string[] = [];

  for (const requestedMetric of requested) {
    const response = await fetch(`${baseUrl}/insights?metric=${encodeURIComponent(requestedMetric)}`, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !Array.isArray(body?.data) || !body.data[0]) {
      failures.push(`${requestedMetric}: ${body?.error?.message || response.status}`);
      continue;
    }
    const item = body.data[0];
    insights[requestedMetric] = item?.values?.[0]?.value ?? item?.value ?? null;
  }

  return {
    views: asNumber(insights.views), reach: asNumber(insights.reach), likes: asNumber(basic.like_count), comments: asNumber(basic.comments_count),
    shares: asNumber(insights.shares), saves: asNumber(insights.saved), rawMetrics: { basic, insights, requested },
    syncStatus: failures.length ? "partial" : "success", errorMessage: failures.length ? failures.join(" | ") : null
  };
}

export async function collectPublicationMetrics(publication: PathwayPublication): Promise<NormalizedPublicationMetrics> {
  const platform = publication.platform.toLowerCase() as PublicationPlatform;
  if (platform === "youtube") return collectYouTube(publication);
  if (platform === "tiktok") return collectTikTok(publication);
  if (platform === "instagram") return collectInstagram(publication);
  return { rawMetrics: {}, syncStatus: "failed", errorMessage: `${publication.platform} metrics collector is not configured yet.` };
}

export async function syncPublicationMetrics(publicationId: string) {
  const service = createServiceClient();
  if (!service) throw new Error("Supabase service access is not configured.");
  const { data, error } = await service.from("pathway_publications").select("id,pathway_slug,asset_id,platform,status,external_post_id,published_url,published_at,metadata").eq("id", publicationId).maybeSingle();
  if (error || !data) throw new Error(error?.message || "Publication not found.");
  const publication = data as PathwayPublication;
  const metrics = await collectPublicationMetrics(publication);
  const { error: insertError } = await service.from("publication_metric_snapshots").insert({
    publication_id: publication.id, pathway_slug: publication.pathway_slug, asset_id: publication.asset_id, platform: publication.platform,
    views: metrics.views ?? null, impressions: metrics.impressions ?? null, reach: metrics.reach ?? null,
    likes: metrics.likes ?? null, comments: metrics.comments ?? null, shares: metrics.shares ?? null, saves: metrics.saves ?? null,
    watch_seconds: metrics.watchSeconds ?? null, average_view_duration_seconds: metrics.averageViewDurationSeconds ?? null,
    average_view_percentage: metrics.averageViewPercentage ?? null, subscribers_gained: metrics.subscribersGained ?? null,
    subscribers_lost: metrics.subscribersLost ?? null, raw_metrics: metrics.rawMetrics, sync_status: metrics.syncStatus, error_message: metrics.errorMessage ?? null
  });
  if (insertError) throw new Error(insertError.message);
  return metrics;
}

export async function listPathwayPublicationPerformance(pathwaySlug: string) {
  const service = createServiceClient();
  const empty = { publications: [] as Array<Record<string, unknown>>, totals: { views: 0, likes: 0, comments: 0, shares: 0, saves: 0, reach: 0 } };
  if (!service) return empty;
  const { data: publications, error: publicationError } = await service.from("pathway_publications").select("*").eq("pathway_slug", pathwaySlug).order("created_at", { ascending: false });
  if (publicationError) return empty;
  const ids = (publications ?? []).map((item) => item.id);
  let metrics: Array<Record<string, unknown>> = [];
  if (ids.length) {
    const result = await service.from("publication_latest_metrics").select("*").in("publication_id", ids);
    if (!result.error) metrics = (result.data ?? []) as Array<Record<string, unknown>>;
  }
  const metricMap = new Map(metrics.map((item) => [String(item.publication_id), item]));
  const rows = (publications ?? []).map((publication) => ({ ...publication, metrics: metricMap.get(String(publication.id)) ?? null }));
  const totals = rows.reduce((sum, row) => {
    const m = row.metrics as Record<string, unknown> | null;
    sum.views += asNumber(m?.views) ?? 0; sum.likes += asNumber(m?.likes) ?? 0; sum.comments += asNumber(m?.comments) ?? 0;
    sum.shares += asNumber(m?.shares) ?? 0; sum.saves += asNumber(m?.saves) ?? 0; sum.reach += asNumber(m?.reach) ?? 0;
    return sum;
  }, { views: 0, likes: 0, comments: 0, shares: 0, saves: 0, reach: 0 });
  return { publications: rows, totals };
}
