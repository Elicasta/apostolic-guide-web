import { createServiceClient } from "./supabase";
import { getSocialPublishingCredentialValues } from "./social-publishing-integrations";

type InstagramMedia = {
  id: string;
  caption?: string;
  media_type?: string;
  media_product_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp?: string;
  like_count?: number;
  comments_count?: number;
  children?: { data?: Array<{ id: string; media_type?: string; media_url?: string; thumbnail_url?: string }> };
};

type InstagramAccount = {
  id?: string;
  username?: string;
  followers_count?: number;
  media_count?: number;
};

function graphError(json: unknown, fallback: string) {
  if (json && typeof json === "object" && "error" in json) {
    const error = (json as { error?: { message?: unknown } }).error;
    if (typeof error?.message === "string") return error.message;
  }
  return fallback;
}

async function instagramGet(path: string, token: string, graphVersion: string) {
  const response = await fetch(`https://graph.instagram.com/${encodeURIComponent(graphVersion)}/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store"
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(graphError(json, `Instagram request failed (${response.status}).`));
  return json;
}

async function firstSuccessful<T>(attempts: Array<() => Promise<T>>) {
  let lastError: unknown;
  for (const attempt of attempts) {
    try { return await attempt(); }
    catch (error) { lastError = error; }
  }
  throw lastError instanceof Error ? lastError : new Error("Instagram request failed.");
}

function titleFromCaption(caption: string | undefined, mediaType: string | undefined) {
  const first = (caption || "").split(/\n+/).map((line) => line.trim()).find(Boolean);
  if (first) return first.slice(0, 160);
  return mediaType === "VIDEO" || mediaType === "REELS" ? "Instagram Reel" : mediaType === "CAROUSEL_ALBUM" ? "Instagram Carousel" : "Instagram Post";
}

function contentType(mediaType: string | undefined, productType?: string | undefined) {
  if (productType === "REELS" || mediaType === "VIDEO" || mediaType === "REELS") return "reel";
  if (mediaType === "CAROUSEL_ALBUM") return "carousel";
  return "post";
}

export async function fetchInstagramFeed(limit = 36) {
  const values = await getSocialPublishingCredentialValues("instagram") as Record<string, string>;
  const token = values.accessToken;
  const userId = values.instagramUserId;
  const graphVersion = values.graphVersion || "v24.0";
  if (!token || !userId) throw new Error("Instagram is not connected.");

  const account = await firstSuccessful<InstagramAccount>([
    () => instagramGet(`${encodeURIComponent(userId)}?fields=id,username,followers_count,media_count`, token, graphVersion) as Promise<InstagramAccount>,
    () => instagramGet(`${encodeURIComponent(userId)}?fields=id,username,followers_count`, token, graphVersion) as Promise<InstagramAccount>,
    () => instagramGet(`${encodeURIComponent(userId)}?fields=id,username`, token, graphVersion) as Promise<InstagramAccount>,
    () => instagramGet(`me?fields=id,username`, token, graphVersion) as Promise<InstagramAccount>
  ]);

  const max = Math.max(1, Math.min(100, limit));
  const feed = await firstSuccessful<{ data?: InstagramMedia[] }>([
    () => instagramGet(`${encodeURIComponent(userId)}/media?fields=${encodeURIComponent("id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count,children{id,media_type,media_url,thumbnail_url}")}&limit=${max}`, token, graphVersion) as Promise<{ data?: InstagramMedia[] }>,
    () => instagramGet(`${encodeURIComponent(userId)}/media?fields=${encodeURIComponent("id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,children{id,media_type,media_url,thumbnail_url}")}&limit=${max}`, token, graphVersion) as Promise<{ data?: InstagramMedia[] }>,
    () => instagramGet(`${encodeURIComponent(userId)}/media?fields=${encodeURIComponent("id,caption,media_type,media_url,thumbnail_url,permalink,timestamp")}&limit=${max}`, token, graphVersion) as Promise<{ data?: InstagramMedia[] }>,
    () => instagramGet(`me/media?fields=${encodeURIComponent("id,caption,media_type,media_url,thumbnail_url,permalink,timestamp")}&limit=${max}`, token, graphVersion) as Promise<{ data?: InstagramMedia[] }>
  ]);

  return { account, media: feed.data ?? [], graphVersion };
}

export async function syncInstagramFeedToCalendar(limit = 36) {
  const service = createServiceClient();
  if (!service) throw new Error("Supabase is not configured.");
  const { account, media, graphVersion } = await fetchInstagramFeed(limit);
  const now = new Date().toISOString();
  const rows = media.map((item) => ({
    pathway_slug: null,
    title: titleFromCaption(item.caption, item.media_type),
    content_type: contentType(item.media_type, item.media_product_type),
    platform: "instagram",
    status: "published",
    scheduled_for: null,
    published_at: item.timestamp || now,
    source: "instagram-feed",
    source_ref: item.id,
    metadata: {
      instagram_media_id: item.id,
      caption: item.caption || "",
      media_type: item.media_type || "IMAGE",
      media_product_type: item.media_product_type || null,
      media_url: item.media_url || null,
      thumbnail_url: item.thumbnail_url || null,
      permalink: item.permalink || null,
      like_count: Number(item.like_count || 0),
      comments_count: Number(item.comments_count || 0),
      children: item.children?.data ?? [],
      graph_version: graphVersion,
      synced_at: now
    },
    updated_at: now
  }));

  if (rows.length) {
    const result = await service.from("studio_content_calendar_items").upsert(rows, { onConflict: "source,source_ref" });
    if (result.error) throw new Error(result.error.message);
  }
  return { account, media, syncedAt: now };
}
