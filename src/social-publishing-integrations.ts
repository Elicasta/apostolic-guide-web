import { createServiceClient } from "./supabase";

export type SocialPublishingPlatform = "youtube" | "instagram" | "threads" | "tiktok";

export type SocialPublishingCredentialStatus = {
  platform: SocialPublishingPlatform;
  appConfigured: boolean;
  accountAuthorized: boolean;
  accountLabel: string | null;
  fields: Record<string, boolean>;
  updatedAt: string | null;
};

export const SOCIAL_PUBLISHING_SECRET_NAMES = {
  youtube: {
    apiKey: "youtube_api_key",
    clientId: "youtube_client_id",
    clientSecret: "youtube_client_secret",
    refreshToken: "youtube_refresh_token",
    channelId: "youtube_channel_id",
    channelTitle: "youtube_channel_title"
  },
  instagram: {
    appId: "meta_instagram_app_id",
    appSecret: "meta_instagram_app_secret",
    accessToken: "meta_instagram_access_token",
    instagramUserId: "meta_instagram_user_id",
    graphVersion: "meta_instagram_graph_version"
  },
  threads: {
    appId: "meta_threads_app_id",
    appSecret: "meta_threads_app_secret",
    accessToken: "meta_threads_access_token",
    userId: "meta_threads_user_id",
    username: "meta_threads_username"
  },
  tiktok: {
    clientKey: "tiktok_client_key",
    clientSecret: "tiktok_client_secret",
    accessToken: "tiktok_access_token",
    refreshToken: "tiktok_refresh_token",
    openId: "tiktok_open_id"
  }
} as const;

export type SocialPublishingCredentialInput = {
  youtube?: Partial<Record<keyof typeof SOCIAL_PUBLISHING_SECRET_NAMES.youtube, string>>;
  instagram?: Partial<Record<keyof typeof SOCIAL_PUBLISHING_SECRET_NAMES.instagram, string>>;
  threads?: Partial<Record<keyof typeof SOCIAL_PUBLISHING_SECRET_NAMES.threads, string>>;
  tiktok?: Partial<Record<keyof typeof SOCIAL_PUBLISHING_SECRET_NAMES.tiktok, string>>;
};

type SecretRow = { name: string; secret: string; updated_at?: string | null };
type ConnectionStatus = { username?: string | null; last_verified_at?: string | null } | null | undefined;
type VerifiedInstagramCandidate = { userId: string; username: string | null; graphVersion: string };

function allSecretNames() {
  return Object.values(SOCIAL_PUBLISHING_SECRET_NAMES).flatMap((group) => Object.values(group));
}

function boolFields<T extends Record<string, string>>(names: T, values: Map<string, string>) {
  return Object.fromEntries(Object.entries(names).map(([field, name]) => [field, Boolean(values.get(name)?.trim())]));
}

export function summarizeSocialPublishingCredentials(
  rows: SecretRow[],
  instagramStatus?: ConnectionStatus,
  threadsStatus?: ConnectionStatus
): SocialPublishingCredentialStatus[] {
  const values = new Map(rows.map((row) => [row.name, row.secret]));
  const updated = new Map(rows.map((row) => [row.name, row.updated_at ?? null]));
  const newest = (names: Record<string, string>) => Object.values(names)
    .map((name) => updated.get(name))
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;

  const youtubeFields = boolFields(SOCIAL_PUBLISHING_SECRET_NAMES.youtube, values);
  const instagramFields = boolFields(SOCIAL_PUBLISHING_SECRET_NAMES.instagram, values);
  const threadsFields = boolFields(SOCIAL_PUBLISHING_SECRET_NAMES.threads, values);
  const tiktokFields = boolFields(SOCIAL_PUBLISHING_SECRET_NAMES.tiktok, values);

  return [
    {
      platform: "youtube",
      appConfigured: youtubeFields.clientId && youtubeFields.clientSecret,
      accountAuthorized: youtubeFields.refreshToken,
      accountLabel: values.get(SOCIAL_PUBLISHING_SECRET_NAMES.youtube.channelTitle)?.trim() || values.get(SOCIAL_PUBLISHING_SECRET_NAMES.youtube.channelId)?.trim() || null,
      fields: youtubeFields,
      updatedAt: newest(SOCIAL_PUBLISHING_SECRET_NAMES.youtube)
    },
    {
      platform: "instagram",
      appConfigured: instagramFields.appSecret && instagramFields.accessToken && instagramFields.instagramUserId,
      accountAuthorized: instagramFields.accessToken && instagramFields.instagramUserId,
      accountLabel: instagramStatus?.username ? `@${instagramStatus.username.replace(/^@/, "")}` : values.get(SOCIAL_PUBLISHING_SECRET_NAMES.instagram.instagramUserId)?.trim() || null,
      fields: instagramFields,
      updatedAt: instagramStatus?.last_verified_at ?? newest(SOCIAL_PUBLISHING_SECRET_NAMES.instagram)
    },
    {
      platform: "threads",
      appConfigured: threadsFields.appId && threadsFields.appSecret,
      accountAuthorized: threadsFields.accessToken && threadsFields.userId,
      accountLabel: threadsStatus?.username ? `@${threadsStatus.username.replace(/^@/, "")}` : values.get(SOCIAL_PUBLISHING_SECRET_NAMES.threads.username)?.trim() ? `@${values.get(SOCIAL_PUBLISHING_SECRET_NAMES.threads.username)?.trim()?.replace(/^@/, "")}` : values.get(SOCIAL_PUBLISHING_SECRET_NAMES.threads.userId)?.trim() || null,
      fields: threadsFields,
      updatedAt: threadsStatus?.last_verified_at ?? newest(SOCIAL_PUBLISHING_SECRET_NAMES.threads)
    },
    {
      platform: "tiktok",
      appConfigured: tiktokFields.clientKey && tiktokFields.clientSecret,
      accountAuthorized: tiktokFields.refreshToken || tiktokFields.accessToken,
      accountLabel: values.get(SOCIAL_PUBLISHING_SECRET_NAMES.tiktok.openId)?.trim() || null,
      fields: tiktokFields,
      updatedAt: newest(SOCIAL_PUBLISHING_SECRET_NAMES.tiktok)
    }
  ];
}

export async function getSocialPublishingCredentialStatus(): Promise<SocialPublishingCredentialStatus[]> {
  const service = createServiceClient();
  if (!service) return summarizeSocialPublishingCredentials([]);

  const [secretsResult, statusResult] = await Promise.all([
    service.schema("analytics").from("integration_secrets")
      .select("name,secret,updated_at")
      .in("name", allSecretNames()),
    service.from("social_connection_status")
      .select("platform,username,last_verified_at")
      .in("platform", ["instagram", "threads"])
  ]);

  if (secretsResult.error) throw new Error(secretsResult.error.message);
  const statuses = new Map((statusResult.error ? [] : statusResult.data ?? []).map((row) => [String(row.platform), row]));
  return summarizeSocialPublishingCredentials(
    (secretsResult.data ?? []) as SecretRow[],
    statuses.get("instagram") as ConnectionStatus,
    statuses.get("threads") as ConnectionStatus
  );
}

export async function getSocialPublishingCredentialValues(platform: SocialPublishingPlatform) {
  const service = createServiceClient();
  if (!service) throw new Error("Supabase service access is not configured.");
  const names = SOCIAL_PUBLISHING_SECRET_NAMES[platform] as Record<string, string>;
  const entries = Object.entries(names);
  const { data, error } = await service.schema("analytics").from("integration_secrets")
    .select("name,secret")
    .in("name", entries.map(([, name]) => name));
  if (error) throw new Error(error.message);
  const values = new Map((data ?? []).map((row) => [String(row.name), String(row.secret)]));
  return Object.fromEntries(entries.map(([field, name]) => [field, values.get(name)?.trim() || ""]));
}

async function validateInstagramCredentialCandidate(input: Record<string, string | undefined>): Promise<VerifiedInstagramCandidate | null> {
  const changingToken = Boolean(input.accessToken?.trim());
  const changingUser = Boolean(input.instagramUserId?.trim());
  if (!changingToken && !changingUser) return null;

  const service = createServiceClient();
  if (!service) throw new Error("Supabase service access is not configured.");
  const current = await getSocialPublishingCredentialValues("instagram") as Record<string, string>;
  const accessToken = input.accessToken?.trim() || current.accessToken;
  const graphVersion = input.graphVersion?.trim() || current.graphVersion || "v24.0";

  if (!accessToken) {
    throw new Error("Instagram Access Token is required. Existing credentials were left unchanged.");
  }

  const response = await fetch(`https://graph.instagram.com/${encodeURIComponent(graphVersion)}/me?fields=id,username`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store"
  });
  const json = await response.json().catch(() => ({})) as { id?: unknown; username?: unknown; error?: { message?: unknown } };
  if (!response.ok) {
    const detail = typeof json.error?.message === "string" ? json.error.message : `Meta rejected the credential (${response.status}).`;
    throw new Error(`Instagram credential check failed: ${detail} The existing stored token was not replaced.`);
  }

  const userId = typeof json.id === "string" ? json.id.trim() : String(json.id ?? "").trim();
  const username = typeof json.username === "string" ? json.username.trim().replace(/^@/, "") : null;
  if (!userId) throw new Error("Instagram credential check did not return an account ID. The existing stored token was not replaced.");

  const { data: existingStatus } = await service.from("social_connection_status")
    .select("username")
    .eq("platform", "instagram")
    .maybeSingle();
  const expectedUsername = typeof existingStatus?.username === "string"
    ? existingStatus.username.trim().replace(/^@/, "").toLowerCase()
    : "";
  if (expectedUsername && username && username.toLowerCase() !== expectedUsername) {
    throw new Error(`Instagram credential belongs to @${username}, not @${expectedUsername}. The existing stored token was not replaced.`);
  }

  const subscribeResponse = await fetch(`https://graph.instagram.com/${encodeURIComponent(graphVersion)}/${encodeURIComponent(userId)}/subscribed_apps?subscribed_fields=messages,comments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: "{}",
    cache: "no-store"
  });
  const subscribeJson = await subscribeResponse.json().catch(() => ({})) as { error?: { message?: unknown } };
  if (!subscribeResponse.ok) {
    const detail = typeof subscribeJson.error?.message === "string" ? subscribeJson.error.message : `Meta rejected webhook subscription (${subscribeResponse.status}).`;
    throw new Error(`Instagram token is valid for @${username || "the selected account"}, but messaging/comment webhook access could not be verified: ${detail} The existing stored token was not replaced.`);
  }

  return { userId, username, graphVersion };
}

export async function saveSocialPublishingCredentials(
  platform: SocialPublishingPlatform,
  input: Record<string, string | undefined>
) {
  const service = createServiceClient();
  if (!service) throw new Error("Supabase service access is not configured.");

  const verifiedInstagram = platform === "instagram"
    ? await validateInstagramCredentialCandidate(input)
    : null;

  const normalizedInput = platform === "instagram" && verifiedInstagram
    ? { ...input, instagramUserId: verifiedInstagram.userId, graphVersion: verifiedInstagram.graphVersion }
    : input;

  const names = SOCIAL_PUBLISHING_SECRET_NAMES[platform] as Record<string, string>;
  const now = new Date().toISOString();
  const rows = Object.entries(normalizedInput).flatMap(([field, raw]) => {
    const name = names[field];
    const secret = raw?.trim();
    if (!name || !secret) return [];
    return [{ name, secret, updated_at: now }];
  });
  if (!rows.length) return getSocialPublishingCredentialStatus();
  const { error } = await service.schema("analytics").from("integration_secrets")
    .upsert(rows, { onConflict: "name" });
  if (error) throw new Error(error.message);

  if (platform === "instagram" && verifiedInstagram) {
    const { error: statusError } = await service.from("social_connection_status").upsert({
      platform: "instagram",
      instagram_user_id: verifiedInstagram.userId,
      username: verifiedInstagram.username,
      graph_version: verifiedInstagram.graphVersion,
      webhook_subscribed: true,
      last_verified_at: now,
      last_error: null,
      updated_at: now
    }, { onConflict: "platform" });
    if (statusError) throw new Error(statusError.message);
  }

  return getSocialPublishingCredentialStatus();
}
