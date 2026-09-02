import "server-only";
import type { ServiceClient } from "./video-producer-server";
import {
  buildEditorialGenerationPrompt,
  normalizeVisualSearchQueries,
  visualBeatDirectionLooksLikeBibleMovie,
  type VideoProducerVisualBeat,
  type VideoProducerVisualCandidate,
  type VideoProducerVisualProvider
} from "./video-producer-visuals";

const FETCH_TIMEOUT_MS = 15_000;
const RUNWAY_API_VERSION = "2024-11-06";
const RUNWAY_BASE = "https://api.dev.runwayml.com/v1";
const FIREFLY_BASE = "https://firefly-api.adobe.io";
const FIREFLY_TOKEN_URL = "https://ims-na1.adobelogin.com/ims/token/v3";

function timeoutSignal(ms = FETCH_TIMEOUT_MS) {
  return AbortSignal.timeout(ms);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function safeQuery(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 120);
}

function choosePexelsFile(files: unknown, vertical: boolean) {
  if (!Array.isArray(files)) return null;
  const parsed = files.flatMap((item) => {
    const row = record(item);
    const link = text(row.link);
    if (!link) return [];
    return [{
      link,
      width: number(row.width) ?? 0,
      height: number(row.height) ?? 0,
      quality: text(row.quality),
      fileType: text(row.file_type)
    }];
  });
  return parsed
    .filter((item) => item.fileType === "video/mp4" || !item.fileType)
    .sort((a, b) => {
      const aOrientation = vertical ? a.height > a.width : a.width >= a.height;
      const bOrientation = vertical ? b.height > b.width : b.width >= b.height;
      if (aOrientation !== bOrientation) return aOrientation ? -1 : 1;
      const aPixels = a.width * a.height;
      const bPixels = b.width * b.height;
      const aGood = aPixels >= 1280 * 720 && aPixels <= 3840 * 2160;
      const bGood = bPixels >= 1280 * 720 && bPixels <= 3840 * 2160;
      if (aGood !== bGood) return aGood ? -1 : 1;
      return bPixels - aPixels;
    })[0] ?? null;
}

export function visualProviderConfigured(provider: VideoProducerVisualProvider) {
  if (provider === "pexels") return Boolean(process.env.PEXELS_API_KEY?.trim());
  if (provider === "pixabay") return Boolean(process.env.PIXABAY_API_KEY?.trim());
  if (provider === "runway") return Boolean(process.env.RUNWAYML_API_SECRET?.trim());
  if (provider === "firefly") return Boolean(process.env.FIREFLY_SERVICES_CLIENT_ID?.trim() && process.env.FIREFLY_SERVICES_CLIENT_SECRET?.trim());
  return true;
}

export async function searchPexelsVideos(query: string, options: { vertical?: boolean; limit?: number } = {}) {
  const apiKey = process.env.PEXELS_API_KEY?.trim();
  if (!apiKey) return [] as VideoProducerVisualCandidate[];
  const q = safeQuery(query);
  if (!q) return [];
  const url = new URL("https://api.pexels.com/v1/videos/search");
  url.searchParams.set("query", q);
  url.searchParams.set("per_page", String(Math.min(12, Math.max(1, options.limit ?? 6))));
  url.searchParams.set("orientation", options.vertical ? "portrait" : "landscape");
  const response = await fetch(url, { headers: { Authorization: apiKey }, cache: "no-store", signal: timeoutSignal() });
  if (!response.ok) throw new Error(`Pexels search failed (${response.status}).`);
  const body = record(await response.json());
  const videos = Array.isArray(body.videos) ? body.videos : [];
  return videos.flatMap((item, index): VideoProducerVisualCandidate[] => {
    const row = record(item);
    const id = String(row.id ?? "").trim();
    const url = text(row.url);
    if (!id || !url) return [];
    const user = record(row.user);
    const file = choosePexelsFile(row.video_files, Boolean(options.vertical));
    const pictures = Array.isArray(row.video_pictures) ? row.video_pictures.map(record) : [];
    const preview = text(pictures[0]?.picture) || null;
    return [{
      id: `pexels:${id}`,
      beatId: "",
      provider: "pexels",
      providerAssetId: id,
      title: `Pexels video ${id}`,
      previewUrl: preview,
      sourceUrl: url,
      downloadUrl: file?.link ?? null,
      creator: text(user.name) || null,
      duration: number(row.duration),
      width: file?.width || number(row.width),
      height: file?.height || number(row.height),
      score: Math.max(1, 92 - index * 4),
      licenseName: "Pexels License",
      licenseUrl: "https://www.pexels.com/license/",
      metadata: { query: q, photographerUrl: text(user.url) || null, providerRank: index + 1 }
    }];
  });
}

function choosePixabayVideo(videos: Record<string, unknown>, vertical: boolean) {
  const keys = ["large", "medium", "small", "tiny"];
  const variants = keys.flatMap((key) => {
    const row = record(videos[key]);
    const url = text(row.url);
    if (!url) return [];
    return [{ key, url, width: number(row.width) ?? 0, height: number(row.height) ?? 0, size: number(row.size) ?? 0 }];
  });
  return variants.sort((a, b) => {
    const ao = vertical ? a.height > a.width : a.width >= a.height;
    const bo = vertical ? b.height > b.width : b.width >= b.height;
    if (ao !== bo) return ao ? -1 : 1;
    const ap = a.width * a.height;
    const bp = b.width * b.height;
    const ag = ap >= 1280 * 720 && ap <= 3840 * 2160;
    const bg = bp >= 1280 * 720 && bp <= 3840 * 2160;
    if (ag !== bg) return ag ? -1 : 1;
    return bp - ap;
  })[0] ?? null;
}

export async function searchPixabayVideos(query: string, options: { vertical?: boolean; limit?: number } = {}) {
  const apiKey = process.env.PIXABAY_API_KEY?.trim();
  if (!apiKey) return [] as VideoProducerVisualCandidate[];
  const q = safeQuery(query);
  if (!q) return [];
  const url = new URL("https://pixabay.com/api/videos/");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("q", q);
  url.searchParams.set("per_page", String(Math.min(20, Math.max(3, options.limit ?? 6))));
  url.searchParams.set("safesearch", "true");
  const response = await fetch(url, { cache: "no-store", signal: timeoutSignal() });
  if (!response.ok) throw new Error(`Pixabay search failed (${response.status}).`);
  const body = record(await response.json());
  const hits = Array.isArray(body.hits) ? body.hits : [];
  return hits.flatMap((item, index): VideoProducerVisualCandidate[] => {
    const row = record(item);
    const id = String(row.id ?? "").trim();
    const pageURL = text(row.pageURL);
    if (!id || !pageURL) return [];
    const selected = choosePixabayVideo(record(row.videos), Boolean(options.vertical));
    if (!selected) return [];
    return [{
      id: `pixabay:${id}`,
      beatId: "",
      provider: "pixabay",
      providerAssetId: id,
      title: text(row.tags) || `Pixabay video ${id}`,
      previewUrl: null,
      sourceUrl: pageURL,
      downloadUrl: selected.url,
      creator: text(row.user) || null,
      duration: number(row.duration),
      width: selected.width,
      height: selected.height,
      score: Math.max(1, 86 - index * 4),
      licenseName: "Pixabay Content License",
      licenseUrl: "https://pixabay.com/service/license-summary/",
      metadata: { query: q, userId: row.user_id ?? null, providerRank: index + 1, tags: text(row.tags) }
    }];
  });
}

export async function searchOwnedVisualLibrary(
  service: ServiceClient,
  queries: string[],
  options: { pathwaySlug?: string | null; limit?: number } = {}
) {
  const limit = Math.min(12, Math.max(1, options.limit ?? 6));
  const terms = normalizeVisualSearchQueries(queries, 8).flatMap((query) => query.toLowerCase().split(/\s+/).filter((term) => term.length >= 3));
  const result = await service.from("video_producer_visual_assets")
    .select("id,source_provider,provider_asset_id,source_url,creator,license_name,license_url,storage_locator,filename,mime_type,size_bytes,sha256,duration,width,height,fps,tags,description,reusable,revision,updated_at")
    .eq("reusable", true)
    .order("updated_at", { ascending: false })
    .limit(120);
  if (result.error) throw new Error(result.error.message);

  const owned = (result.data ?? []).map((asset) => {
    const haystack = [asset.filename, asset.description, ...(Array.isArray(asset.tags) ? asset.tags : [])].filter(Boolean).join(" ").toLowerCase();
    const matched = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
    return { asset, matched };
  }).filter((row) => row.matched > 0 || terms.length === 0)
    .sort((a, b) => b.matched - a.matched || String(b.asset.updated_at).localeCompare(String(a.asset.updated_at)))
    .slice(0, limit)
    .map(({ asset, matched }, index): VideoProducerVisualCandidate => ({
      id: `ag-library:${asset.id}`,
      beatId: "",
      provider: "ag-library",
      providerAssetId: asset.id,
      title: asset.filename,
      sourceUrl: asset.source_url,
      creator: asset.creator,
      duration: asset.duration,
      width: asset.width,
      height: asset.height,
      score: Math.min(100, 96 + matched - index),
      licenseName: asset.license_name,
      licenseUrl: asset.license_url,
      metadata: { storedAssetId: asset.id, storageLocator: asset.storage_locator, sha256: asset.sha256, revision: asset.revision }
    }));

  if (owned.length >= limit || !options.pathwaySlug) return owned;

  const pathway = await service.from("studio_pathway_assets")
    .select("id,title,source_type,status,storage_bucket,storage_path,public_url,metadata,updated_at")
    .eq("pathway_slug", options.pathwaySlug)
    .eq("studio", "video")
    .eq("asset_type", "uploaded-video")
    .in("status", ["approved", "ready", "published"])
    .order("updated_at", { ascending: false })
    .limit(80);
  if (pathway.error) throw new Error(pathway.error.message);
  const pathwayRows = (pathway.data ?? []).map((asset) => {
    const metadata = record(asset.metadata);
    const tags = Array.isArray(metadata.tags) ? metadata.tags.filter((tag): tag is string => typeof tag === "string") : [];
    const haystack = [asset.title, text(metadata.description), ...tags].join(" ").toLowerCase();
    const matched = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
    return { asset, metadata, matched };
  }).filter((row) => row.matched > 0 || terms.length === 0)
    .sort((a, b) => b.matched - a.matched || String(b.asset.updated_at).localeCompare(String(a.asset.updated_at)))
    .slice(0, limit - owned.length)
    .map(({ asset, metadata, matched }, index): VideoProducerVisualCandidate => ({
      id: `pathway:${asset.id}`,
      beatId: "",
      provider: "ag-library",
      providerAssetId: asset.id,
      title: asset.title,
      previewUrl: asset.public_url,
      sourceUrl: asset.public_url,
      score: Math.min(99, 93 + matched - index),
      licenseName: "Apostolic Guide owned media",
      metadata: { pathwayAssetId: asset.id, storageBucket: asset.storage_bucket, storagePath: asset.storage_path, ...metadata }
    }));
  return [...owned, ...pathwayRows];
}

export async function searchRealVisualCandidates(input: {
  service: ServiceClient;
  beat: VideoProducerVisualBeat;
  pathwaySlug?: string | null;
  mode: "podcast" | "reels";
  limit?: number;
}) {
  const limit = Math.min(8, Math.max(3, input.limit ?? 6));
  const queries = normalizeVisualSearchQueries(input.beat.searchQueries, 5);
  const fallbackQuery = safeQuery(input.beat.dialogue || input.beat.intent);
  if (!queries.length && fallbackQuery) queries.push(fallbackQuery);

  const owned = await searchOwnedVisualLibrary(input.service, queries, { pathwaySlug: input.pathwaySlug, limit });
  if (owned.length >= limit) return owned.slice(0, limit).map((item) => ({ ...item, beatId: input.beat.id }));

  const query = queries[0] || input.beat.vocabulary.replaceAll("-", " ");
  const remaining = limit - owned.length;
  const [pexels, pixabay] = await Promise.allSettled([
    searchPexelsVideos(query, { vertical: input.mode === "reels", limit: remaining }),
    searchPixabayVideos(query, { vertical: input.mode === "reels", limit: remaining })
  ]);
  const external = [
    ...(pexels.status === "fulfilled" ? pexels.value : []),
    ...(pixabay.status === "fulfilled" ? pixabay.value : [])
  ].sort((a, b) => Number(b.score ?? 0) - Number(a.score ?? 0));

  const results = [...owned, ...external.slice(0, remaining)]
    .slice(0, limit)
    .map((item) => ({ ...item, beatId: input.beat.id }));
  return results;
}

export type RunwayTask = {
  id: string;
  status?: string;
  output?: string[];
  createdAt?: string;
  failure?: string;
  raw: Record<string, unknown>;
};

export async function createRunwayVisualTask(input: {
  beat: VideoProducerVisualBeat;
  mode: "podcast" | "reels";
  promptImage?: string | null;
}) {
  const apiKey = process.env.RUNWAYML_API_SECRET?.trim();
  if (!apiKey) throw new Error("RUNWAYML_API_SECRET is not configured.");
  if (visualBeatDirectionLooksLikeBibleMovie(input.beat)) {
    throw new Error("Visual direction violates the AG no-Bible-movie rule. Use Scripture, graphics, real documentary footage, or an editorial fragment instead.");
  }
  const promptText = buildEditorialGenerationPrompt({ beat: input.beat, mode: input.mode, imageToVideo: Boolean(input.promptImage) });
  const body: Record<string, unknown> = {
    model: "gen4.5",
    promptText,
    ratio: input.mode === "reels" ? "720:1280" : "1280:720",
    duration: 5
  };
  if (input.promptImage) body.promptImage = input.promptImage;
  const response = await fetch(`${RUNWAY_BASE}/image_to_video`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Runway-Version": RUNWAY_API_VERSION
    },
    body: JSON.stringify(body),
    signal: timeoutSignal(30_000)
  });
  if (!response.ok) throw new Error(`Runway generation failed (${response.status}): ${(await response.text().catch(() => "")).slice(0, 500)}`);
  const raw = record(await response.json());
  const id = text(raw.id);
  if (!id) throw new Error("Runway returned no task id.");
  return { id, promptText, model: "gen4.5", raw };
}

export async function getRunwayVisualTask(taskId: string): Promise<RunwayTask> {
  const apiKey = process.env.RUNWAYML_API_SECRET?.trim();
  if (!apiKey) throw new Error("RUNWAYML_API_SECRET is not configured.");
  const response = await fetch(`${RUNWAY_BASE}/tasks/${encodeURIComponent(taskId)}`, {
    headers: { Authorization: `Bearer ${apiKey}`, "X-Runway-Version": RUNWAY_API_VERSION },
    cache: "no-store",
    signal: timeoutSignal()
  });
  if (!response.ok) throw new Error(`Runway task lookup failed (${response.status}).`);
  const raw = record(await response.json());
  return {
    id: text(raw.id) || taskId,
    status: text(raw.status) || undefined,
    output: Array.isArray(raw.output) ? raw.output.filter((value): value is string => typeof value === "string") : undefined,
    createdAt: text(raw.createdAt) || undefined,
    failure: text(raw.failure) || text(raw.failureCode) || undefined,
    raw
  };
}

let fireflyTokenCache: { token: string; expiresAt: number } | null = null;

async function fireflyAccessToken() {
  if (fireflyTokenCache && fireflyTokenCache.expiresAt > Date.now() + 60_000) return fireflyTokenCache.token;
  const clientId = process.env.FIREFLY_SERVICES_CLIENT_ID?.trim();
  const clientSecret = process.env.FIREFLY_SERVICES_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new Error("Firefly server credentials are not configured.");
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: "openid,AdobeID,session,additional_info,read_organizations,firefly_api,ff_apis"
  });
  const response = await fetch(FIREFLY_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: timeoutSignal()
  });
  if (!response.ok) throw new Error(`Firefly authentication failed (${response.status}).`);
  const data = record(await response.json());
  const token = text(data.access_token);
  const expiresIn = number(data.expires_in) ?? 3600;
  if (!token) throw new Error("Firefly authentication returned no access token.");
  fireflyTokenCache = { token, expiresAt: Date.now() + Math.max(60, expiresIn - 120) * 1000 };
  return token;
}

export async function createFireflyVisualTask(input: {
  beat: VideoProducerVisualBeat;
  mode: "podcast" | "reels";
  promptImage?: { uploadId?: string; url?: string } | null;
}) {
  const clientId = process.env.FIREFLY_SERVICES_CLIENT_ID?.trim();
  if (!clientId) throw new Error("FIREFLY_SERVICES_CLIENT_ID is not configured.");
  const configuredEndpoint = process.env.FIREFLY_VIDEO_GENERATE_ENDPOINT?.trim();
  if (!configuredEndpoint) {
    throw new Error("Firefly is reserved as a future provider seam. Set the current Adobe Generate Video endpoint only when the full generation and polling path is enabled.");
  }
  if (visualBeatDirectionLooksLikeBibleMovie(input.beat)) {
    throw new Error("Visual direction violates the AG no-Bible-movie rule. Use Scripture, graphics, real documentary footage, or an editorial fragment instead.");
  }
  const prompt = buildEditorialGenerationPrompt({ beat: input.beat, mode: input.mode, imageToVideo: Boolean(input.promptImage) });
  const token = await fireflyAccessToken();
  const size = input.mode === "reels" ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 };
  const payload: Record<string, unknown> = { prompt, size };
  if (input.promptImage?.uploadId) payload.source = { uploadId: input.promptImage.uploadId };
  else if (input.promptImage?.url) payload.source = { url: input.promptImage.url };
  const endpoint = configuredEndpoint.startsWith("http") ? configuredEndpoint : `${FIREFLY_BASE}${configuredEndpoint.startsWith("/") ? configuredEndpoint : `/${configuredEndpoint}`}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "x-api-key": clientId,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(payload),
    signal: timeoutSignal(30_000)
  });
  if (!response.ok) throw new Error(`Firefly video generation failed (${response.status}): ${(await response.text().catch(() => "")).slice(0, 500)}`);
  const raw = record(await response.json());
  const id = text(raw.jobId) || text(raw.id);
  if (!id) throw new Error("Firefly returned no generation job id.");
  return { id, promptText: prompt, model: "firefly-video", raw };
}
