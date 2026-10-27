import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildWelcomeEmail } from "../src/welcome-email";
import { DEFAULT_WELCOME_COPY, parseWelcomeCopy, welcomeCopySchema } from "../src/welcome-automation-config";

test("Welcome email escapes edited text and provides opt-out", () => {
  const content = { ...DEFAULT_WELCOME_COPY, headline: "<b>Unsafe</b>", body: "<script>alert(1)</script> Follow Scripture." };
  const email = buildWelcomeEmail({ liveTeachings: true, newArticles: true, copy: content, unsubscribeUrl: "https://www.apostolicguide.com/unsubscribe?token=example" });
  assert.match(email.html, /&lt;b&gt;Unsafe&lt;\/b&gt;/);
  assert.doesNotMatch(email.html, /<script>/);
  assert.match(email.html, /Unsubscribe<\/a>/);
  assert.match(email.text, /Unsubscribe: https:\/\//);
  assert.match(email.html, /Explore Scripture Pathways/);
});

test("Default welcome copy used for unconfigured initial row", () => {
  assert.deepEqual(parseWelcomeCopy({}), DEFAULT_WELCOME_COPY);
  const email = buildWelcomeEmail({ liveTeachings: false, newArticles: true });
  assert.match(email.text, /new Scripture studies and articles/);
  assert.match(email.html, /Apostolic Guide/);
});

test("Welcome buttons must use HTTPS Apostolic Guide domains", () => {
  assert.equal(welcomeCopySchema.safeParse({ ...DEFAULT_WELCOME_COPY, buttonUrl: "javascript:alert(1)" }).success, false);
  assert.equal(welcomeCopySchema.safeParse({ ...DEFAULT_WELCOME_COPY, buttonUrl: "https://evil.example/" }).success, false);
  assert.equal(welcomeCopySchema.safeParse(DEFAULT_WELCOME_COPY).success, true);
});

test("API uses idempotent delivery ledger instead of untracked welcome sends", () => {
  const signup = readFileSync("app/api/subscribe/route.ts", "utf8");
  const automation = readFileSync("src/email-automations.ts", "utf8");
  const sql = readFileSync("supabase/migrations/20261027193000_welcome_email_automations.sql", "utf8");
  assert.match(signup, /!existing \? await enqueueWelcomeEmail/);
  assert.doesNotMatch(signup, /sendWelcomeEmail\(/);
  assert.match(automation, /ignoreDuplicates: true/);
  assert.match(automation, /already_claimed/);
  assert.match(automation, /subscriber.status !== "subscribed"/);
  assert.match(automation, /"uncertain"/);
  assert.match(sql, /unique \(automation_key,subscriber_id\)/);
  assert.match(sql, /enable row level security/);
});

test("Admin actions require distribution permissions and test only signed-in admin", () => {
  const api = readFileSync("app/api/admin/email-automations/route.ts", "utf8");
  assert.match(api, /getStudioPermission\("manage_distribution"\)/);
  assert.match(api, /permission.access.user.email, input.copy/);
  assert.match(api, /eq\("revision", input.revision\)/);
  assert.doesNotMatch(api, /sendBroadcast/);
});
