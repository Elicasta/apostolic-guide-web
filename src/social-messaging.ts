import { createHmac, timingSafeEqual } from "node:crypto";
import { createServiceClient } from "./supabase";

export type SocialTriggerType = "dm_keyword" | "comment_keyword";
export type SocialMatchType = "exact" | "contains" | "starts_with";

export type SocialAutomation = {
  id: string;
  name: string;
  platform: "instagram";
  trigger_type: SocialTriggerType;
  keywords: string[];
  match_type: SocialMatchType;
  reply_text: string;
  destination_url: string | null;
  enabled: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type InstagramConnection = {
  configured: boolean;
  instagramUserId: string | null;
  username: string | null;
  graphVersion: string;
  webhookSubscribed: boolean;
  lastVerifiedAt: string | null;
  lastWebhookAt: string | null;
  lastError: string | null;
  hasAccessToken: boolean;
  hasAppSecret: boolean;
  verifyToken: string;
};

type InstagramConfig = {
  appSecret: string;
  accessToken: string;
  instagramUserId: string;
  verifyToken: string;
  graphVersion: string;
};

type ParsedInstagramTrigger = {
  externalEventId: string;
  triggerType: SocialTriggerType;
  text: string;
  senderId: string | null;
  commentId: string | null;
  mediaId: string | null;
  eventAt: string;
};

const SECRET_NAMES = {
  appSecret: "meta_instagram_app_secret",
  accessToken: "meta_instagram_access_token",
  instagramUserId: "meta_instagram_user_id",
  verifyToken: "meta_instagram_verify_token",
  graphVersion: "meta_instagram_graph_version"
} as const;

export const DEFAULT_META_GRAPH_VERSION = "v24.0";
export const DEFAULT_META_VERIFY_TOKEN = "apostolic-guide-instagram-webhook";

function normalize(value: string) {
  return value.trim().toLocaleLowerCase();
}

export function keywordMatches(message: string, keyword: string, matchType: SocialMatchType) {
  const text = normalize(message);
  const needle = normalize(keyword);
  if (!text || !needle) return false;
  if (matchType === "exact") return text === needle;
  if (matchType === "starts_with") return text.startsWith(needle);
  return text.includes(needle);
}

export function findMatchingAutomation(message: string, automations: SocialAutomation[]) {
  const candidates = automations
    .filter((automation) => automation.enabled)
    .flatMap((automation) => automation.keywords.map((keyword) => ({ automation, keyword })))
    .filter(({ automation, keyword }) => keywordMatches(message, keyword, automation.match_type))
    .sort((a, b) => normalize(b.keyword).length - normalize(a.keyword).length);
  return candidates[0] ?? null;
}

export function buildSocialReply(replyText: string, destinationUrl?: string | null) {
  const text = replyText.trim();
  const url = destinationUrl?.trim();
  if (!url) return text;
  if (text.includes(url)) return text;
  return `${text}\n\n${url}`;
}

export function verifyMetaSignature(rawBody: string, signature: string | null, appSecret: string) {
  if (!signature?.startsWith("sha256=") || !appSecret) return false;
  const expected = `sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

async function readSecrets() {
  const service = createServiceClient();
  if (!service) return new Map<string, string>();
  const names = Object.values(SECRET_NAMES);
  const { data } = await service.schema("analytics").from("integration_secrets").select("name,secret").in("name", names);
  return new Map((data ?? []).map((row) => [String(row.name), String(row.secret)]));
}

export async function getInstagramConfig(): Promise<InstagramConfig | null> {
  const values = await readSecrets();
  const appSecret = values.get(SECRET_NAMES.appSecret) ?? "";
  const accessToken = values.get(SECRET_NAMES.accessToken) ?? "";
  const instagramUserId = values.get(SECRET_NAMES.instagramUserId) ?? "";
  const verifyToken = values.get(SECRET_NAMES.verifyToken) || DEFAULT_META_VERIFY_TOKEN;
  const graphVersion = values.get(SECRET_NAMES.graphVersion) || DEFAULT_META_GRAPH_VERSION;
  if (!appSecret || !accessToken || !instagramUserId) return null;
  return { appSecret, accessToken, instagramUserId, verifyToken, graphVersion };
}

export async function saveInstagramConfig(input: {
  appSecret?: string;
  accessToken?: string;
  instagramUserId?: string;
  verifyToken?: string;
  graphVersion?: string;
}) {
  const service = createServiceClient();
  if (!service) throw new Error("Supabase service access is not configured.");
  const entries = [
    input.appSecret?.trim() ? [SECRET_NAMES.appSecret, input.appSecret.trim()] : null,
    input.accessToken?.trim() ? [SECRET_NAMES.accessToken, input.accessToken.trim()] : null,
    input.instagramUserId?.trim() ? [SECRET_NAMES.instagramUserId, input.instagramUserId.trim()] : null,
    input.verifyToken?.trim() ? [SECRET_NAMES.verifyToken, input.verifyToken.trim()] : null,
    input.graphVersion?.trim() ? [SECRET_NAMES.graphVersion, input.graphVersion.trim()] : null
  ].filter(Boolean) as Array<[string, string]>;
  if (entries.length) {
    const { error } = await service.schema("analytics").from("integration_secrets").upsert(
      entries.map(([name, secret]) => ({ name, secret, updated_at: new Date().toISOString() })),
      { onConflict: "name" }
    );
    if (error) throw new Error(error.message);
  }
}

export async function getInstagramConnection(): Promise<InstagramConnection> {
  const service = createServiceClient();
  const values = await readSecrets();
  const instagramUserId = values.get(SECRET_NAMES.instagramUserId) ?? null;
  const accessToken = values.get(SECRET_NAMES.accessToken) ?? "";
  const appSecret = values.get(SECRET_NAMES.appSecret) ?? "";
  const graphVersion = values.get(SECRET_NAMES.graphVersion) || DEFAULT_META_GRAPH_VERSION;
  const verifyToken = values.get(SECRET_NAMES.verifyToken) || DEFAULT_META_VERIFY_TOKEN;
  let status: Record<string, unknown> | null = null;
  if (service) {
    const result = await service.schema("social").from("connection_status").select("*").eq("platform", "instagram").maybeSingle();
    status = result.data as Record<string, unknown> | null;
  }
  return {
    configured: Boolean(instagramUserId && accessToken && appSecret),
    instagramUserId,
    username: typeof status?.username === "string" ? status.username : null,
    graphVersion,
    webhookSubscribed: status?.webhook_subscribed === true,
    lastVerifiedAt: typeof status?.last_verified_at === "string" ? status.last_verified_at : null,
    lastWebhookAt: typeof status?.last_webhook_at === "string" ? status.last_webhook_at : null,
    lastError: typeof status?.last_error === "string" ? status.last_error : null,
    hasAccessToken: Boolean(accessToken),
    hasAppSecret: Boolean(appSecret),
    verifyToken
  };
}

async function graphFetch(path: string, config: InstagramConfig, init?: RequestInit) {
  const response = await fetch(`https://graph.instagram.com/${config.graphVersion}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    },
    cache: "no-store"
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof json?.error?.message === "string" ? json.error.message : `Meta request failed (${response.status}).`;
    throw new Error(message);
  }
  return json;
}

export async function verifyAndSubscribeInstagram() {
  const config = await getInstagramConfig();
  if (!config) throw new Error("Instagram credentials are incomplete.");
  const service = createServiceClient();
  if (!service) throw new Error("Supabase service access is not configured.");
  try {
    const profile = await graphFetch(`${encodeURIComponent(config.instagramUserId)}?fields=id,username`, config);
    await graphFetch(`${encodeURIComponent(config.instagramUserId)}/subscribed_apps?subscribed_fields=messages,comments`, config, { method: "POST", body: "{}" });
    const now = new Date().toISOString();
    const username = typeof profile.username === "string" ? profile.username : null;
    await service.schema("social").from("connection_status").upsert({
      platform: "instagram",
      instagram_user_id: config.instagramUserId,
      username,
      graph_version: config.graphVersion,
      webhook_subscribed: true,
      last_verified_at: now,
      last_error: null,
      updated_at: now
    }, { onConflict: "platform" });
    return { username, instagramUserId: config.instagramUserId, webhookSubscribed: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Instagram verification failed.";
    await service.schema("social").from("connection_status").upsert({
      platform: "instagram",
      instagram_user_id: config.instagramUserId,
      graph_version: config.graphVersion,
      webhook_subscribed: false,
      last_error: message,
      updated_at: new Date().toISOString()
    }, { onConflict: "platform" });
    throw error;
  }
}

export async function listSocialAutomations(): Promise<SocialAutomation[]> {
  const service = createServiceClient();
  if (!service) return [];
  const { data } = await service.schema("social").from("automations").select("*").order("updated_at", { ascending: false });
  return (data ?? []) as SocialAutomation[];
}

export async function socialMetrics() {
  const service = createServiceClient();
  if (!service) return { active: 0, triggeredToday: 0, sentToday: 0, totalSent: 0 };
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const [active, triggeredToday, sentToday, totalSent] = await Promise.all([
    service.schema("social").from("automations").select("id", { count: "exact", head: true }).eq("enabled", true),
    service.schema("social").from("events").select("id", { count: "exact", head: true }).gte("event_at", start.toISOString()).in("delivery_status", ["matched", "sent", "failed"]),
    service.schema("social").from("events").select("id", { count: "exact", head: true }).gte("event_at", start.toISOString()).eq("delivery_status", "sent"),
    service.schema("social").from("events").select("id", { count: "exact", head: true }).eq("delivery_status", "sent")
  ]);
  return { active: active.count ?? 0, triggeredToday: triggeredToday.count ?? 0, sentToday: sentToday.count ?? 0, totalSent: totalSent.count ?? 0 };
}

export async function listRecentSocialEvents(limit = 20) {
  const service = createServiceClient();
  if (!service) return [];
  const { data } = await service.schema("social").from("events")
    .select("id,automation_id,trigger_type,matched_keyword,delivery_status,source_media_id,event_at,error_code")
    .order("event_at", { ascending: false }).limit(limit);
  return data ?? [];
}

export function parseInstagramWebhook(payload: unknown): ParsedInstagramTrigger[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as { object?: string; entry?: unknown[] };
  if (root.object !== "instagram" || !Array.isArray(root.entry)) return [];
  const results: ParsedInstagramTrigger[] = [];
  for (const entryRaw of root.entry) {
    if (!entryRaw || typeof entryRaw !== "object") continue;
    const entry = entryRaw as { messaging?: unknown[]; changes?: unknown[] };
    for (const itemRaw of Array.isArray(entry.messaging) ? entry.messaging : []) {
      if (!itemRaw || typeof itemRaw !== "object") continue;
      const item = itemRaw as { sender?: { id?: string }; recipient?: { id?: string }; timestamp?: number; message?: { mid?: string; text?: string; is_echo?: boolean } };
      if (!item.message?.mid || !item.message.text || item.message.is_echo) continue;
      results.push({
        externalEventId: `message:${item.message.mid}`,
        triggerType: "dm_keyword",
        text: item.message.text,
        senderId: item.sender?.id ?? null,
        commentId: null,
        mediaId: null,
        eventAt: item.timestamp ? new Date(item.timestamp).toISOString() : new Date().toISOString()
      });
    }
    for (const changeRaw of Array.isArray(entry.changes) ? entry.changes : []) {
      if (!changeRaw || typeof changeRaw !== "object") continue;
      const change = changeRaw as { field?: string; value?: { id?: string; text?: string; from?: { id?: string }; media?: { id?: string } } };
      if (change.field !== "comments" && change.field !== "live_comments") continue;
      const value = change.value;
      if (!value?.id || !value.text) continue;
      results.push({
        externalEventId: `comment:${value.id}`,
        triggerType: "comment_keyword",
        text: value.text,
        senderId: value.from?.id ?? null,
        commentId: value.id,
        mediaId: value.media?.id ?? null,
        eventAt: new Date().toISOString()
      });
    }
  }
  return results;
}

async function sendInstagramReply(config: InstagramConfig, trigger: ParsedInstagramTrigger, text: string) {
  const recipient = trigger.triggerType === "comment_keyword"
    ? { comment_id: trigger.commentId }
    : { id: trigger.senderId };
  if ((trigger.triggerType === "comment_keyword" && !trigger.commentId) || (trigger.triggerType === "dm_keyword" && !trigger.senderId)) {
    throw new Error("Instagram webhook did not include a usable recipient.");
  }
  return graphFetch(`${encodeURIComponent(config.instagramUserId)}/messages`, config, {
    method: "POST",
    body: JSON.stringify({ recipient, message: { text } })
  });
}

export async function processInstagramWebhook(payload: unknown) {
  const config = await getInstagramConfig();
  const service = createServiceClient();
  if (!config || !service) return { processed: 0, sent: 0 };
  const triggers = parseInstagramWebhook(payload);
  if (!triggers.length) return { processed: 0, sent: 0 };
  await service.schema("social").from("connection_status").upsert({ platform: "instagram", last_webhook_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: "platform" });
  const automations = await listSocialAutomations();
  let sent = 0;
  for (const trigger of triggers) {
    const existing = await service.schema("social").from("events").select("id").eq("external_event_id", trigger.externalEventId).maybeSingle();
    if (existing.data) continue;
    const match = findMatchingAutomation(trigger.text, automations.filter((item) => item.trigger_type === trigger.triggerType));
    if (!match) {
      await service.schema("social").from("events").insert({
        external_event_id: trigger.externalEventId,
        trigger_type: trigger.triggerType,
        source_media_id: trigger.mediaId,
        delivery_status: "ignored",
        event_at: trigger.eventAt
      });
      continue;
    }
    try {
      const reply = buildSocialReply(match.automation.reply_text, match.automation.destination_url);
      const result = await sendInstagramReply(config, trigger, reply);
      await service.schema("social").from("events").insert({
        external_event_id: trigger.externalEventId,
        automation_id: match.automation.id,
        trigger_type: trigger.triggerType,
        matched_keyword: match.keyword,
        source_media_id: trigger.mediaId,
        delivery_status: "sent",
        provider_message_id: typeof result.message_id === "string" ? result.message_id : null,
        event_at: trigger.eventAt
      });
      sent += 1;
    } catch (error) {
      await service.schema("social").from("events").insert({
        external_event_id: trigger.externalEventId,
        automation_id: match.automation.id,
        trigger_type: trigger.triggerType,
        matched_keyword: match.keyword,
        source_media_id: trigger.mediaId,
        delivery_status: "failed",
        error_code: (error instanceof Error ? error.message : "Instagram send failed").slice(0, 500),
        event_at: trigger.eventAt
      });
    }
  }
  return { processed: triggers.length, sent };
}
