import crypto from "node:crypto";
import { createServiceClient } from "./supabase";

export const THREADS_REDIRECT_URI = "https://apostolicguide.com/api/admin/meta/threads/callback";
export const THREADS_SCOPES = ["threads_basic", "threads_content_publish", "threads_manage_insights"] as const;

export const THREADS_SECRET_NAMES = {
  appId: "meta_threads_app_id",
  appSecret: "meta_threads_app_secret",
  accessToken: "meta_threads_access_token",
  userId: "meta_threads_user_id",
  username: "meta_threads_username",
  expiresAt: "meta_threads_expires_at"
} as const;

type SecretRow = { name: string; secret: string; updated_at?: string | null };

export async function getThreadsCredentialValues() {
  const service = createServiceClient();
  const fallback = {
    appId: process.env.META_THREADS_APP_ID?.trim() || "",
    appSecret: process.env.META_THREADS_APP_SECRET?.trim() || "",
    accessToken: process.env.META_THREADS_ACCESS_TOKEN?.trim() || "",
    userId: process.env.META_THREADS_USER_ID?.trim() || "",
    username: "",
    expiresAt: ""
  };
  if (!service) return fallback;
  const entries = Object.entries(THREADS_SECRET_NAMES);
  const { data, error } = await service.schema("analytics").from("integration_secrets")
    .select("name,secret,updated_at")
    .in("name", entries.map(([, name]) => name));
  if (error) throw new Error(error.message);
  const values = new Map((data ?? []).map((row) => [String(row.name), String(row.secret)]));
  return Object.fromEntries(entries.map(([field, name]) => [field, values.get(name)?.trim() || fallback[field as keyof typeof fallback] || ""])) as typeof fallback;
}

export async function getThreadsCredentialStatus() {
  const service = createServiceClient();
  const values = await getThreadsCredentialValues();
  let lastVerifiedAt: string | null = null;
  if (service) {
    const status = await service.from("social_connection_status")
      .select("username,last_verified_at,last_error")
      .eq("platform", "threads")
      .maybeSingle();
    if (!status.error && status.data) {
      if (status.data.username) values.username = String(status.data.username);
      lastVerifiedAt = status.data.last_verified_at ? String(status.data.last_verified_at) : null;
    }
  }
  return {
    appConfigured: Boolean(values.appId && values.appSecret),
    accountAuthorized: Boolean(values.accessToken && values.userId),
    accountLabel: values.username ? `@${values.username.replace(/^@/, "")}` : values.userId || null,
    fields: Object.fromEntries(Object.keys(THREADS_SECRET_NAMES).map((key) => [key, Boolean(values[key as keyof typeof values])])),
    updatedAt: lastVerifiedAt,
    callbackUrl: THREADS_REDIRECT_URI
  };
}

export async function saveThreadsAppCredentials(input: { appId?: string; appSecret?: string }) {
  const service = createServiceClient();
  if (!service) throw new Error("Supabase service access is not configured.");
  const now = new Date().toISOString();
  const rows = [
    input.appId?.trim() ? { name: THREADS_SECRET_NAMES.appId, secret: input.appId.trim(), updated_at: now } : null,
    input.appSecret?.trim() ? { name: THREADS_SECRET_NAMES.appSecret, secret: input.appSecret.trim(), updated_at: now } : null
  ].filter(Boolean) as Array<{ name: string; secret: string; updated_at: string }>;
  if (rows.length) {
    const { error } = await service.schema("analytics").from("integration_secrets").upsert(rows, { onConflict: "name" });
    if (error) throw new Error(error.message);
  }
  return getThreadsCredentialStatus();
}

export async function saveThreadsAuthorization(input: { accessToken: string; userId: string; expiresIn?: number; username?: string }) {
  const service = createServiceClient();
  if (!service) throw new Error("Supabase service access is not configured.");
  const now = new Date().toISOString();
  const expiresAt = input.expiresIn ? new Date(Date.now() + input.expiresIn * 1000).toISOString() : "";
  const rows = [
    { name: THREADS_SECRET_NAMES.accessToken, secret: input.accessToken.trim(), updated_at: now },
    { name: THREADS_SECRET_NAMES.userId, secret: input.userId.trim(), updated_at: now },
    ...(input.username?.trim() ? [{ name: THREADS_SECRET_NAMES.username, secret: input.username.trim(), updated_at: now }] : []),
    ...(expiresAt ? [{ name: THREADS_SECRET_NAMES.expiresAt, secret: expiresAt, updated_at: now }] : [])
  ];
  const { error } = await service.schema("analytics").from("integration_secrets").upsert(rows, { onConflict: "name" });
  if (error) throw new Error(error.message);
  await service.from("social_connection_status").upsert({
    platform: "threads",
    instagram_user_id: input.userId,
    username: input.username?.trim() || null,
    graph_version: "threads",
    webhook_subscribed: false,
    last_verified_at: now,
    last_error: null,
    updated_at: now
  }, { onConflict: "platform" });
}

export async function clearThreadsAuthorization(reason = "Threads authorization removed.") {
  const service = createServiceClient();
  if (!service) return;
  await service.schema("analytics").from("integration_secrets").delete().in("name", [
    THREADS_SECRET_NAMES.accessToken,
    THREADS_SECRET_NAMES.userId,
    THREADS_SECRET_NAMES.username,
    THREADS_SECRET_NAMES.expiresAt
  ]);
  const now = new Date().toISOString();
  await service.from("social_connection_status").upsert({
    platform: "threads",
    instagram_user_id: null,
    username: null,
    graph_version: "threads",
    webhook_subscribed: false,
    last_verified_at: now,
    last_error: reason,
    updated_at: now
  }, { onConflict: "platform" });
}

export function verifyThreadsSignedRequest(signedRequest: string, appSecret: string) {
  const [encodedSignature, payload] = signedRequest.split(".");
  if (!encodedSignature || !payload || !appSecret) return null;
  const signature = Buffer.from(encodedSignature.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  const expected = crypto.createHmac("sha256", appSecret).update(payload).digest();
  if (signature.length !== expected.length || !crypto.timingSafeEqual(signature, expected)) return null;
  try {
    return JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}
