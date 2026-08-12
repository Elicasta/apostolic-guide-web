import { createServiceClient } from "./supabase";

export type SocialPublishingPlatform = "youtube" | "instagram" | "tiktok";

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
    channelId: "youtube_channel_id"
  },
  instagram: {
    appId: "meta_instagram_app_id",
    appSecret: "meta_instagram_app_secret",
    accessToken: "meta_instagram_access_token",
    instagramUserId: "meta_instagram_user_id",
    graphVersion: "meta_instagram_graph_version"
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
  tiktok?: Partial<Record<keyof typeof SOCIAL_PUBLISHING_SECRET_NAMES.tiktok, string>>;
};

type SecretRow = { name: string; secret: string; updated_at?: string | null };

function allSecretNames() {
  return Object.values(SOCIAL_PUBLISHING_SECRET_NAMES).flatMap((group) => Object.values(group));
}

function boolFields<T extends Record<string, string>>(names: T, values: Map<string, string>) {
  return Object.fromEntries(Object.entries(names).map(([field, name]) => [field, Boolean(values.get(name)?.trim())]));
}

export function summarizeSocialPublishingCredentials(
  rows: SecretRow[],
  instagramStatus?: { username?: string | null; last_verified_at?: string | null } | null
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
  const tiktokFields = boolFields(SOCIAL_PUBLISHING_SECRET_NAMES.tiktok, values);

  return [
    {
      platform: "youtube",
      appConfigured: youtubeFields.clientId && youtubeFields.clientSecret,
      accountAuthorized: youtubeFields.refreshToken,
      accountLabel: values.get(SOCIAL_PUBLISHING_SECRET_NAMES.youtube.channelId)?.trim() || null,
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

  const [secretsResult, instagramResult] = await Promise.all([
    service.schema("analytics").from("integration_secrets")
      .select("name,secret,updated_at")
      .in("name", allSecretNames()),
    service.from("social_connection_status")
      .select("username,last_verified_at")
      .eq("platform", "instagram")
      .maybeSingle()
  ]);

  if (secretsResult.error) throw new Error(secretsResult.error.message);
  const instagramStatus = instagramResult.error ? null : instagramResult.data;
  return summarizeSocialPublishingCredentials((secretsResult.data ?? []) as SecretRow[], instagramStatus);
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

export async function saveSocialPublishingCredentials(
  platform: SocialPublishingPlatform,
  input: Record<string, string | undefined>
) {
  const service = createServiceClient();
  if (!service) throw new Error("Supabase service access is not configured.");
  const names = SOCIAL_PUBLISHING_SECRET_NAMES[platform] as Record<string, string>;
  const now = new Date().toISOString();
  const rows = Object.entries(input).flatMap(([field, raw]) => {
    const name = names[field];
    const secret = raw?.trim();
    if (!name || !secret) return [];
    return [{ name, secret, updated_at: now }];
  });
  if (!rows.length) return getSocialPublishingCredentialStatus();
  const { error } = await service.schema("analytics").from("integration_secrets")
    .upsert(rows, { onConflict: "name" });
  if (error) throw new Error(error.message);
  return getSocialPublishingCredentialStatus();
}
