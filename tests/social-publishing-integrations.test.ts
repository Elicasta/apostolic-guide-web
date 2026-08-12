import assert from "node:assert/strict";
import test from "node:test";
import {
  SOCIAL_PUBLISHING_SECRET_NAMES,
  summarizeSocialPublishingCredentials
} from "../src/social-publishing-integrations";

test("Instagram publishing status reuses the existing messaging secret names", () => {
  assert.equal(SOCIAL_PUBLISHING_SECRET_NAMES.instagram.appSecret, "meta_instagram_app_secret");
  assert.equal(SOCIAL_PUBLISHING_SECRET_NAMES.instagram.accessToken, "meta_instagram_access_token");
  assert.equal(SOCIAL_PUBLISHING_SECRET_NAMES.instagram.instagramUserId, "meta_instagram_user_id");
});

test("credential summaries distinguish app setup from account authorization", () => {
  const statuses = summarizeSocialPublishingCredentials([
    { name: "youtube_client_id", secret: "client" },
    { name: "youtube_client_secret", secret: "secret" },
    { name: "tiktok_client_key", secret: "key" },
    { name: "tiktok_client_secret", secret: "secret" },
    { name: "meta_instagram_app_secret", secret: "secret" },
    { name: "meta_instagram_access_token", secret: "token" },
    { name: "meta_instagram_user_id", secret: "123" }
  ], { username: "apostolicguide", last_verified_at: "2026-08-12T00:00:00.000Z" });

  const youtube = statuses.find((item) => item.platform === "youtube");
  const instagram = statuses.find((item) => item.platform === "instagram");
  const tiktok = statuses.find((item) => item.platform === "tiktok");

  assert.equal(youtube?.appConfigured, true);
  assert.equal(youtube?.accountAuthorized, false);
  assert.equal(instagram?.appConfigured, true);
  assert.equal(instagram?.accountAuthorized, true);
  assert.equal(instagram?.accountLabel, "@apostolicguide");
  assert.equal(tiktok?.appConfigured, true);
  assert.equal(tiktok?.accountAuthorized, false);
});

test("refresh tokens mark YouTube and TikTok accounts as authorized", () => {
  const statuses = summarizeSocialPublishingCredentials([
    { name: "youtube_client_id", secret: "client" },
    { name: "youtube_client_secret", secret: "secret" },
    { name: "youtube_refresh_token", secret: "refresh" },
    { name: "tiktok_client_key", secret: "key" },
    { name: "tiktok_client_secret", secret: "secret" },
    { name: "tiktok_refresh_token", secret: "refresh" }
  ]);
  assert.equal(statuses.find((item) => item.platform === "youtube")?.accountAuthorized, true);
  assert.equal(statuses.find((item) => item.platform === "tiktok")?.accountAuthorized, true);
});
