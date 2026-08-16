import { setTimeout as wait } from "node:timers/promises";
import { instagramGraphBase } from "./instagram-api";
import { normalizePathwayVideoPublishingMetadata } from "./pathway-video-publishing";
import { getSocialPublishingCredentialValues } from "./social-publishing-integrations";
import { createServiceClient } from "./supabase";

type PublicationMetadata = {
  source_kind?: "render" | "clip";
  render_id?: string;
  clip_id?: string;
  requested_privacy?: "private" | "unlisted" | "public";
  caption?: string;
  title?: string;
  hashtags?: string[];
  cover_url?: string | null;
};

type TokenResponse = { access_token?: string; error?: string; error_description?: string };
type YouTubeVideoResponse = { id?: string; status?: { privacyStatus?: string }; error?: { message?: string } };
type GraphResponse = { id?: string; status_code?: string; permalink?: string; error?: { message?: string } };

function record(value: unknown) {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

async function youtubeAccessToken() {
  const credentials = await getSocialPublishingCredentialValues("youtube") as Record<string, string>;
  if (!credentials.clientId || !credentials.clientSecret || !credentials.refreshToken) {
    throw new Error("YouTube is not authorized. Open Setup and connect YouTube first.");
  }
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: credentials.clientId, client_secret: credentials.clientSecret, refresh_token: credentials.refreshToken, grant_type: "refresh_token" })
  });
  const data = await response.json().catch(() => ({})) as TokenResponse;
  if (!response.ok || !data.access_token) throw new Error(data.error_description || data.error || `Google token refresh failed (${response.status}).`);
  return data.access_token;
}

async function graphJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({})) as GraphResponse;
  if (!response.ok || data.error) throw new Error(data.error?.message || `Instagram API request failed (${response.status}).`);
  return data;
}

async function sourceForInstagram(service: NonNullable<ReturnType<typeof createServiceClient>>, slug: string, metadata: PublicationMetadata) {
  if (metadata.source_kind === "clip" && metadata.clip_id) {
    const clipResult = await service.from("pathway_social_clips").select("id,asset_id,status,output_url,caption").eq("id", metadata.clip_id).eq("pathway_slug", slug).maybeSingle();
    if (clipResult.error) throw new Error(clipResult.error.message);
    const clip = clipResult.data;
    if (!clip?.output_url || clip.status !== "completed") throw new Error("The scheduled AI social clip is not ready.");
    return { outputUrl: clip.output_url, assetId: clip.asset_id as string | null, clipCaption: clip.caption as string | null, sourceId: clip.id, sourceKind: "clip" as const };
  }

  const renderId = metadata.render_id;
  if (!renderId) throw new Error("Scheduled Instagram publication is missing its render source.");
  const renderResult = await service.from("pathway_video_renders").select("id,asset_id,format,status,output_url").eq("id", renderId).eq("pathway_slug", slug).maybeSingle();
  if (renderResult.error) throw new Error(renderResult.error.message);
  const render = renderResult.data;
  if (!render?.output_url || render.status !== "completed" || render.format !== "vertical") throw new Error("The scheduled 9:16 render is not ready.");
  return { outputUrl: render.output_url, assetId: render.asset_id as string | null, clipCaption: null, sourceId: render.id, sourceKind: "render" as const };
}

async function publishYouTube(publicationId: string, slug: string, metadata: PublicationMetadata) {
  const service = createServiceClient();
  if (!service) throw new Error("Supabase service access is not configured.");
  if (!metadata.render_id) throw new Error("Scheduled YouTube publication is missing its render source.");

  const [renderResult, kitResult] = await Promise.all([
    service.from("pathway_video_renders").select("id,asset_id,format,status,output_url").eq("id", metadata.render_id).eq("pathway_slug", slug).maybeSingle(),
    service.from("pathway_video_publishing_kits").select("metadata").eq("pathway_slug", slug).maybeSingle()
  ]);
  if (renderResult.error) throw new Error(renderResult.error.message);
  if (kitResult.error) throw new Error(kitResult.error.message);
  const render = renderResult.data;
  if (!render?.output_url || render.status !== "completed" || render.format !== "youtube") throw new Error("The scheduled YouTube render is not ready.");
  if (!kitResult.data) throw new Error("The Pathway publishing kit is missing.");
  const kit = normalizePathwayVideoPublishingMetadata(kitResult.data.metadata);
  if (!kit.youtubeTitle || !kit.youtubeDescription) throw new Error("YouTube title and description are required.");

  const token = await youtubeAccessToken();
  const source = await fetch(render.output_url, { cache: "no-store" });
  if (!source.ok) throw new Error(`Finished MP4 could not be loaded (${source.status}).`);
  const bytes = Buffer.from(await source.arrayBuffer());
  if (!bytes.length) throw new Error("Finished MP4 is empty.");
  const hashtags = kit.youtubeHashtags.map((tag) => tag.startsWith("#") ? tag : `#${tag.replace(/^#+/, "")}`).join(" ");
  const description = hashtags ? `${kit.youtubeDescription.trim()}\n\n${hashtags}`.slice(0, 5000) : kit.youtubeDescription.trim();
  const privacy = metadata.requested_privacy ?? "private";
  const body = { snippet: { title: kit.youtubeTitle, description, tags: kit.youtubeTags, categoryId: "27", defaultLanguage: "en", defaultAudioLanguage: "en" }, status: { privacyStatus: privacy, embeddable: true, selfDeclaredMadeForKids: false } };

  const init = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json; charset=UTF-8", "x-upload-content-length": String(bytes.length), "x-upload-content-type": "video/mp4" },
    body: JSON.stringify(body)
  });
  if (!init.ok) throw new Error(`YouTube upload session failed (${init.status}): ${(await init.text().catch(() => "")).slice(0, 1000)}`);
  const uploadUrl = init.headers.get("location");
  if (!uploadUrl) throw new Error("YouTube did not return a resumable upload URL.");
  const upload = await fetch(uploadUrl, { method: "PUT", headers: { authorization: `Bearer ${token}`, "content-type": "video/mp4", "content-length": String(bytes.length) }, body: bytes });
  const result = await upload.json().catch(() => ({})) as YouTubeVideoResponse;
  if (!upload.ok || !result.id) throw new Error(result.error?.message || `YouTube video upload failed (${upload.status}).`);

  const publishedUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(result.id)}`;
  const now = new Date().toISOString();
  const updates = await Promise.all([
    service.from("pathway_publications").update({ status: "published", external_post_id: result.id, published_url: publishedUrl, published_at: now, error_message: null, metadata: { ...metadata, actual_privacy: result.status?.privacyStatus ?? null, title: kit.youtubeTitle } }).eq("id", publicationId),
    render.asset_id ? service.from("pathway_assets").update({ status: "published", published_url: publishedUrl, published_at: now }).eq("id", render.asset_id) : Promise.resolve({ error: null })
  ]);
  const updateError = updates.find((item) => item.error)?.error;
  if (updateError) throw new Error(updateError.message);
  return { publishedUrl };
}

async function publishInstagram(publicationId: string, slug: string, metadata: PublicationMetadata) {
  const service = createServiceClient();
  if (!service) throw new Error("Supabase service access is not configured.");
  const [source, kitResult, credentials] = await Promise.all([
    sourceForInstagram(service, slug, metadata),
    service.from("pathway_video_publishing_kits").select("metadata").eq("pathway_slug", slug).maybeSingle(),
    getSocialPublishingCredentialValues("instagram") as Promise<Record<string, string>>
  ]);
  if (kitResult.error) throw new Error(kitResult.error.message);
  const kit = normalizePathwayVideoPublishingMetadata(kitResult.data?.metadata);
  const baseCaption = metadata.caption?.trim() || source.clipCaption?.trim() || kit.reelCaption.trim();
  if (!baseCaption) throw new Error("Instagram Reel caption is required.");
  if (!credentials.accessToken || !credentials.instagramUserId) throw new Error("Instagram publishing credentials are missing. Open Setup and reconnect Instagram.");
  const base = instagramGraphBase(credentials.graphVersion);
  const tagSource = Array.isArray(metadata.hashtags) && metadata.hashtags.length ? metadata.hashtags : kit.socialHashtags;
  const tags = tagSource.map((tag) => tag.startsWith("#") ? tag : `#${tag.replace(/^#+/, "")}`).join(" ");
  const caption = tags ? `${baseCaption}\n\n${tags}`.slice(0, 2200) : baseCaption.slice(0, 2200);

  const createParams = new URLSearchParams({ media_type: "REELS", video_url: source.outputUrl, caption, share_to_feed: "true", access_token: credentials.accessToken });
  const container = await graphJson(`${base}/${encodeURIComponent(credentials.instagramUserId)}/media?${createParams.toString()}`, { method: "POST" });
  if (!container.id) throw new Error("Instagram did not return a Reel container ID.");

  let status = "IN_PROGRESS";
  for (let attempt = 0; attempt < 18; attempt += 1) {
    const statusParams = new URLSearchParams({ fields: "status_code", access_token: credentials.accessToken });
    const current = await graphJson(`${base}/${encodeURIComponent(container.id)}?${statusParams.toString()}`);
    status = current.status_code || status;
    if (status === "FINISHED") break;
    if (["ERROR", "EXPIRED"].includes(status)) throw new Error(`Instagram Reel processing ended with ${status}.`);
    await wait(4000);
  }
  if (status !== "FINISHED") throw new Error("Instagram Reel is still processing. It can be retried from Publishing Suite.");

  const publishParams = new URLSearchParams({ creation_id: container.id, access_token: credentials.accessToken });
  const published = await graphJson(`${base}/${encodeURIComponent(credentials.instagramUserId)}/media_publish?${publishParams.toString()}`, { method: "POST" });
  if (!published.id) throw new Error("Instagram did not return a published media ID.");
  let permalink: string | null = null;
  try {
    const permalinkParams = new URLSearchParams({ fields: "permalink", access_token: credentials.accessToken });
    const media = await graphJson(`${base}/${encodeURIComponent(published.id)}?${permalinkParams.toString()}`);
    permalink = media.permalink || null;
  } catch {
    permalink = null;
  }

  const now = new Date().toISOString();
  const updates = await Promise.all([
    service.from("pathway_publications").update({ status: "published", external_post_id: published.id, published_url: permalink, published_at: now, error_message: null, metadata: { ...metadata, container_id: container.id, caption, source_kind: source.sourceKind, source_id: source.sourceId } }).eq("id", publicationId),
    source.assetId ? service.from("pathway_assets").update({ status: "published", published_url: permalink, published_at: now }).eq("id", source.assetId) : Promise.resolve({ error: null })
  ]);
  const updateError = updates.find((item) => item.error)?.error;
  if (updateError) throw new Error(updateError.message);
  return { publishedUrl: permalink };
}

export async function executeScheduledPublication(publicationId: string) {
  const service = createServiceClient();
  if (!service) throw new Error("Supabase service access is not configured.");
  const claimed = await service.from("pathway_publications").update({ status: "publishing", error_message: null, updated_at: new Date().toISOString() }).eq("id", publicationId).eq("status", "scheduled").select("id,pathway_slug,platform,metadata").maybeSingle();
  if (claimed.error) throw new Error(claimed.error.message);
  if (!claimed.data) return { skipped: true };

  const metadata = record(claimed.data.metadata) as PublicationMetadata;
  try {
    if (claimed.data.platform === "youtube") return await publishYouTube(claimed.data.id, claimed.data.pathway_slug, metadata);
    if (claimed.data.platform === "instagram") return await publishInstagram(claimed.data.id, claimed.data.pathway_slug, metadata);
    await service.from("pathway_publications").update({ status: "scheduled", error_message: "TikTok Direct Post is not enabled yet.", updated_at: new Date().toISOString() }).eq("id", claimed.data.id);
    return { skipped: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scheduled publishing failed.";
    await service.from("pathway_publications").update({ status: "failed", error_message: message.slice(0, 1800), updated_at: new Date().toISOString() }).eq("id", claimed.data.id);
    throw error;
  }
}
