import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { addCampaignTracking, rate, verifyResendWebhook } from "../src/campaign-intelligence";

test("internal campaign links receive stable first-party attribution", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const result = new URL(addCampaignTracking("https://apostolicguide.com/articles/why-jesus-prayed?ref=home", id, "article"));
  assert.equal(result.searchParams.get("ref"), "home");
  assert.equal(result.searchParams.get("utm_source"), "apostolic_guide");
  assert.equal(result.searchParams.get("utm_medium"), "email");
  assert.equal(result.searchParams.get("utm_campaign"), id);
  assert.equal(result.searchParams.get("utm_content"), "article");
});

test("external campaign links are not mutated", () => {
  const result = addCampaignTracking("https://www.youtube.com/watch?v=abc123", "11111111-1111-4111-8111-111111111111", "youtube");
  assert.equal(result, "https://www.youtube.com/watch?v=abc123");
});

test("webhook verification accepts a valid Svix signature and rejects tampering", () => {
  const key = Buffer.from("apostolic-guide-test-secret");
  const secret = `whsec_${key.toString("base64")}`;
  const payload = JSON.stringify({ type: "email.delivered", data: { email_id: "email_1" } });
  const id = "msg_test_123";
  const nowMs = Date.now();
  const timestamp = String(Math.floor(nowMs / 1000));
  const signature = createHmac("sha256", key).update(`${id}.${timestamp}.${payload}`).digest("base64");

  assert.equal(verifyResendWebhook(payload, { id, timestamp, signature: `v1,${signature}` }, secret, nowMs), true);
  assert.equal(verifyResendWebhook(`${payload} `, { id, timestamp, signature: `v1,${signature}` }, secret, nowMs), false);
  assert.equal(verifyResendWebhook(payload, { id, timestamp, signature: `v1,${signature}` }, secret, nowMs + 301_000), false);
});

test("rate returns a one-decimal percentage without dividing by zero", () => {
  assert.equal(rate(27, 100), 27);
  assert.equal(rate(2, 3), 66.7);
  assert.equal(rate(0, 0), 0);
});
