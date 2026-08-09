import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { buildSocialReply, findMatchingAutomation, keywordMatches, parseInstagramWebhook, verifyMetaSignature, type SocialAutomation } from "../src/social-messaging";

function automation(overrides: Partial<SocialAutomation> = {}): SocialAutomation {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Jesus study",
    platform: "instagram",
    trigger_type: "comment_keyword",
    keywords: ["JESUS"],
    match_type: "contains",
    reply_text: "Here is the study:",
    destination_url: "https://apostolicguide.com/topics/jesus-is-god",
    enabled: true,
    created_by: null,
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
    ...overrides
  };
}

test("keyword matching is case-insensitive and supports exact, contains, and starts-with modes", () => {
  assert.equal(keywordMatches("Jesus", "JESUS", "exact"), true);
  assert.equal(keywordMatches("Send me the Jesus study", "jesus", "contains"), true);
  assert.equal(keywordMatches("study please", "study", "starts_with"), true);
  assert.equal(keywordMatches("I want a study", "study", "exact"), false);
});

test("the most specific matching keyword wins", () => {
  const generic = automation({ id: "11111111-1111-4111-8111-111111111111", keywords: ["god"] });
  const specific = automation({ id: "22222222-2222-4222-8222-222222222222", keywords: ["jesus is god"] });
  const match = findMatchingAutomation("Can I get the JESUS IS GOD study?", [generic, specific]);
  assert.equal(match?.automation.id, specific.id);
  assert.equal(match?.keyword, "jesus is god");
});

test("reply builder appends the destination once", () => {
  const url = "https://apostolicguide.com/pathways/who-is-jesus-christ";
  assert.equal(buildSocialReply("Here you go", url), `Here you go\n\n${url}`);
  assert.equal(buildSocialReply(`Here you go ${url}`, url), `Here you go ${url}`);
});

test("Instagram webhook parser handles both DM and comment keyword events", () => {
  const payload = {
    object: "instagram",
    entry: [{
      messaging: [{ sender: { id: "person-1" }, timestamp: 1000, message: { mid: "mid-1", text: "JESUS" } }],
      changes: [{ field: "comments", value: { id: "comment-1", text: "STUDY", from: { id: "person-2" }, media: { id: "media-1" } } }]
    }]
  };
  const parsed = parseInstagramWebhook(payload);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0]?.triggerType, "dm_keyword");
  assert.equal(parsed[1]?.triggerType, "comment_keyword");
});

test("Meta webhook signatures reject tampered bodies", () => {
  const secret = "meta-test-secret";
  const body = JSON.stringify({ object: "instagram", entry: [] });
  const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  assert.equal(verifyMetaSignature(body, signature, secret), true);
  assert.equal(verifyMetaSignature(`${body} `, signature, secret), false);
});
