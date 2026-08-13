import crypto from "node:crypto";
import { createServiceClient } from "./supabase";
import { getSocialPublishingCredentialValues, saveSocialPublishingCredentials } from "./social-publishing-integrations";

export const THREADS_REDIRECT_URI = "https://apostolicguide.com/api/admin/meta/threads/callback";
export const THREADS_SCOPES = ["threads_basic", "threads_content_publish", "threads_manage_insights"] as const;

export async function getThreadsAppCredentials() {
  const stored = await getSocialPublishingCredentialValues("threads").catch(() => ({} as Record<string, string>));
  return {
    appId: stored.appId || process.env.META_THREADS_APP_ID?.trim() || "",
    appSecret: stored.appSecret || process.env.META_THREADS_APP_SECRET?.trim() || "",
    accessToken: stored.accessToken || process.env.META_THREADS_ACCESS_TOKEN?.trim() || "",
    userId: stored.userId || process.env.META_THREADS_USER_ID?.trim() || ""
  };
}

export function encodeOAuthState(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

export function decodeOAuthState(value: string) {
  try { return Buffer.from(value, "base64url").toString("utf8"); }
  catch { return ""; }
}

export function verifySignedRequest(signedRequest: string, appSecret: string) {
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

export async function saveThreadsAuthorization(input: {
  accessToken: string;
  userId: string;
  expiresIn?: number;
  username?: string;
}) {
  const expiresAt = input.expiresIn ? new Date(Date.now() + input.expiresIn * 1000).toISOString() : "";
  await saveSocialPublishingCredentials("threads", {
    accessToken: input.accessToken,
    userId: input.userId,
    username: input.username || "",
    expiresAt
  });
  const service = createServiceClient();
  if (service) {
    await service.from("social_connection_status").upsert({
      platform: "threads",
      instagram_user_id: input.userId,
      username: input.username || null,
      graph_version: "threads",
      webhook_subscribed: false,
      last_verified_at: new Date().toISOString(),
      last_error: null,
      updated_at: new Date().toISOString()
    }, { onConflict: "platform" });
  }
}

export async function clearThreadsAuthorization(reason?: string) {
  const service = createServiceClient();
  if (!service) return;
  const names = ["meta_threads_access_token", "meta_threads_user_id", "meta_threads_username", "meta_threads_expires_at"];
  await service.schema("analytics").from("integration_secrets").delete().in("name", names);
  await service.from("social_connection_status").upsert({
    platform: "threads",
    instagram_user_id: null,
    username: null,
    graph_version: "threads",
    webhook_subscribed: false,
    last_verified_at: new Date().toISOString(),
    last_error: reason || "Threads authorization removed.",
    updated_at: new Date().toISOString()
  }, { onConflict: "platform" });
}
