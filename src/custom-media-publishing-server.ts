import { setTimeout as wait } from "node:timers/promises";
import "server-only";
import { instagramGraphBase } from "./instagram-api";
import { privateBlobReadUrl } from "./private-blob";
import { getSocialPublishingCredentialValues } from "./social-publishing-integrations";
import { createServiceClient } from "./supabase";

export type CustomMediaFormat = "image" | "reel" | "long_form";
export type CustomMediaPublicationMetadata = {
  source_kind: "custom_asset";
  custom_asset_id: string;
  media_format: CustomMediaFormat;
  mime_type?: string;
  title?: string;
  description?: string;
  caption?: string;
  hashtags?: string[];
  tags?: string[];
  alt_text?: string;
  internal_tags?: string[];
  requested_privacy?: "private" | "unlisted" | "public";
};

type AssetRow = {
  id: string;
  pathway_slug: string;
  title: string;
  status: string;
  storage_bucket: string | null;
  storage_path: string | null;
  public_url: string | null;
  metadata: Record<string, unknown> | null;
};

type GraphResponse = { id?: string; status_code?: string; permalink?: string; error?: { message?: string } };
type TokenResponse = { access_token?: string; error?: string; error_description?: string };
type YouTubeVideoResponse = { id?: string; status?: { privacyStatus?: string }; error?: { message?: string } };

function cleanList(value: unknown, max = 30) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))].slice(0, max);
}

function mimeFromAsset(asset: AssetRow, metadata: CustomMediaPublicationMetadata) {
  const stored = asset.metadata && typeof asset.metadata === "object" ? asset.metadata : {};
  return String(metadata.mime_type || stored.mimeType || stored.mime || "").trim().toLowerCase();
}

async function mediaUrl(asset: AssetRow) {
  if (asset.storage_bucket === "vercel_blob" && asset.storage_path) return privateBlobReadUrl(asset.storage_path, 45 * 60 * 1000);
  if (asset.public_url && /^https:\/\//.test(asset.public_url)) return asset.public_url;
  throw new Error("Custom media is missing a publishable source URL.");
}

async function graphJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({})) as GraphResponse;
  if (!response.ok || data.error) throw new Error(data.error?.message || `Instagram API request failed (${response.status}).`);
  return data;
}

async function waitForInstagramContainer(base: string, containerId: string, accessToken: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const params = new URLSearchParams({ fields: "status_code", access_token: accessToken });
    const current = await graphJson(`${base}/${encodeURIComponent(containerId)}?${params.toString()}`);
    const status = current.status_code || "FINISHED";
    if (status === "FINISHED") return;
    if (["ERROR", "EXPIRED"].includes(status)) throw new Error(`Instagram media processing ended with ${status}.`);
    await wait(3000);
  }
  throw new Error("Instagram media is still processing. Retry this publication from Publishing.");
}

async function publishInstagram(asset: AssetRow, metadata: CustomMediaPublicationMetadata) {
  const credentials = await getSocialPublishingCredentialValues("instagram") as Record<string, string>;
  if (!credentials.accessToken || !credentials.instagramUserId) throw new Error("Instagram publishing credentials are missing. Open Setup and reconnect Instagram.");
  const sourceUrl = await mediaUrl(asset);
  const mime = mimeFromAsset(asset, metadata);
  const isVideo = mime.startsWith("video/");
  if (!isVideo && metadata.media_format !== "image") throw new Error("Instagram image posts must use the Image format.");
  if (isVideo && metadata.media_format === "long_form") throw new Error("Instagram custom video publishes through the Reel lane. Choose Reel / Short Form.");

  const base = instagramGraphBase(credentials.graphVersion);
  const tags = cleanList(metadata.hashtags, 15).map((tag) => tag.startsWith("#") ? tag : `#${tag.replace(/^#+/, "")}`).join(" ");
  const baseCaption = String(metadata.caption || metadata.description || "").trim();
  const caption = (tags ? `${baseCaption}\n\n${tags}` : baseCaption).slice(0, 2200);
  const createParams = new URLSearchParams({ caption, access_token: credentials.accessToken });
  if (isVideo) {
    createParams.set("media_type", "REELS");
    createParams.set("video_url", sourceUrl);
    createParams.set("share_to_feed", "true");
  } else {
    createParams.set("image_url", sourceUrl);
  }
  const container = await graphJson(`${base}/${encodeURIComponent(credentials.instagramUserId)}/media?${createParams.toString()}`, { method: "POST" });
  if (!container.id) throw new Error("Instagram did not return a media container ID.");
  await waitForInstagramContainer(base, container.id, credentials.accessToken);
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
  return { externalId: published.id, publishedUrl: permalink, platformMetadata: { container_id: container.id, caption } };
}

async function youtubeAccessToken() {
  const credentials = await getSocialPublishingCredentialValues("youtube") as Record<string, string>;
  if (!credentials.clientId || !credentials.clientSecret || !credentials.refreshToken) throw new Error("YouTube is not authorized. Open Setup and connect YouTube first.");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: credentials.clientId, client_secret: credentials.clientSecret, refresh_token: credentials.refreshToken, grant_type: "refresh_token" })
  });
  const data = await response.json().catch(() => ({})) as TokenResponse;
  if (!response.ok || !data.access_token) throw new Error(data.error_description || data.error || `Google token refresh failed (${response.status}).`);
  return data.access_token;
}

async function publishYouTube(asset: AssetRow, metadata: CustomMediaPublicationMetadata) {
  const mime = mimeFromAsset(asset, metadata);
  if (!mime.startsWith("video/")) throw new Error("YouTube custom publishing accepts video files only.");
  if (metadata.media_format === "image") throw new Error("An image cannot be published as a YouTube video.");
  const title = String(metadata.title || asset.title || "").trim().slice(0, 100);
  const descriptionBase = String(metadata.description || metadata.caption || "").trim();
  if (!title) throw new Error("YouTube title is required.");
  if (!descriptionBase) throw new Error("YouTube description is required.");

  const hashtags = cleanList(metadata.hashtags, 8).map((tag) => tag.startsWith("#") ? tag : `#${tag.replace(/^#+/, "")}`).join(" ");
  const description = (hashtags ? `${descriptionBase}\n\n${hashtags}` : descriptionBase).slice(0, 5000);
  const tags = cleanList(metadata.tags, 30);
  const token = await youtubeAccessToken();
  const sourceUrl = await mediaUrl(asset);
  const source = await fetch(sourceUrl, { cache: "no-store" });
  if (!source.ok || !source.body) throw new Error(`Uploaded video could not be loaded (${source.status}).`);
  const stored = asset.metadata && typeof asset.metadata === "object" ? asset.metadata : {};
  const contentLength = Number(stored.bytes || source.headers.get("content-length") || 0);
  if (!Number.isFinite(contentLength) || contentLength <= 0) throw new Error("Uploaded video size is missing. Re-upload the source before publishing to YouTube.");

  const privacy = metadata.requested_privacy ?? "private";
  const body = {
    snippet: { title, description, tags, categoryId: "27", defaultLanguage: "en", defaultAudioLanguage: "en" },
    status: { privacyStatus: privacy, embeddable: true, selfDeclaredMadeForKids: false }
  };
  const init = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json; charset=UTF-8",
      "x-upload-content-length": String(contentLength),
      "x-upload-content-type": mime || "video/mp4"
    },
    body: JSON.stringify(body)
  });
  if (!init.ok) throw new Error(`YouTube upload session failed (${init.status}): ${(await init.text().catch(() => "")).slice(0, 1000)}`);
  const uploadUrl = init.headers.get("location");
  if (!uploadUrl) throw new Error("YouTube did not return a resumable upload URL.");
  const uploadInit: RequestInit & { duplex: "half" } = {
    method: "PUT",
    headers: { authorization: `Bearer ${token}`, "content-type": mime || "video/mp4", "content-length": String(contentLength) },
    body: source.body,
    duplex: "half"
  };
  const upload = await fetch(uploadUrl, uploadInit);
  const result = await upload.json().catch(() => ({})) as YouTubeVideoResponse;
  if (!upload.ok || !result.id) throw new Error(result.error?.message || `YouTube video upload failed (${upload.status}).`);
  return {
    externalId: result.id,
    publishedUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(result.id)}`,
    platformMetadata: { actual_privacy: result.status?.privacyStatus ?? null, title, description, tags }
  };
}

export async function executeCustomMediaPublication(input: {
  publicationId: string;
  pathwaySlug: string;
  platform: string;
  metadata: CustomMediaPublicationMetadata;
}) {
  const service = createServiceClient();
  if (!service) throw new Error("Supabase service access is not configured.");
  const assetResult = await service.from("studio_pathway_assets")
    .select("id,pathway_slug,title,status,storage_bucket,storage_path,public_url,metadata")
    .eq("id", input.metadata.custom_asset_id)
    .maybeSingle();
  if (assetResult.error) throw new Error(assetResult.error.message);
  if (!assetResult.data) throw new Error("The uploaded custom media asset no longer exists.");
  const asset = assetResult.data as AssetRow;
  if (asset.pathway_slug !== input.pathwaySlug) throw new Error("The custom media Pathway changed after scheduling. Review it and schedule again.");

  const result = input.platform === "instagram"
    ? await publishInstagram(asset, input.metadata)
    : input.platform === "youtube"
      ? await publishYouTube(asset, input.metadata)
      : (() => { throw new Error(`Custom media publishing is not enabled for ${input.platform}.`); })();
  const now = new Date().toISOString();
  const mergedMetadata = { ...input.metadata, ...result.platformMetadata };
  const currentAssetMetadata = asset.metadata && typeof asset.metadata === "object" ? asset.metadata : {};
  const [publicationUpdate, assetUpdate, calendarUpdate] = await Promise.all([
    service.from("pathway_publications").update({
      status: "published",
      external_post_id: result.externalId,
      published_url: result.publishedUrl,
      published_at: now,
      error_message: null,
      metadata: mergedMetadata,
      updated_at: now
    }).eq("id", input.publicationId),
    service.from("studio_pathway_assets").update({
      status: "published",
      metadata: {
        ...currentAssetMetadata,
        customPublishing: true,
        lastPublishedPlatform: input.platform,
        lastPublishedUrl: result.publishedUrl,
        publishedAt: now
      },
      updated_at: now
    }).eq("id", asset.id),
    service.from("studio_content_calendar_items").update({
      status: "published",
      published_at: now,
      metadata: { ...mergedMetadata, published_url: result.publishedUrl },
      updated_at: now
    }).eq("source", "custom-media").eq("source_ref", input.publicationId)
  ]);
  const error = publicationUpdate.error || assetUpdate.error || calendarUpdate.error;
  if (error) throw new Error(error.message);
  return { publishedUrl: result.publishedUrl, externalId: result.externalId };
}
