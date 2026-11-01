import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("review queue is visible in the Library and gated by manage_content", () => {
  const nav = readFileSync("src/studio-nav.tsx","utf8");
  const page = readFileSync("app/admin/ekegusii-reviews/page.tsx","utf8");
  const detail = readFileSync("app/admin/ekegusii-reviews/[id]/page.tsx","utf8");
  assert.match(nav, /\/admin\/ekegusii-reviews/);
  assert.match(nav, /permission: "manage_content"/);
  assert.match(page, /getStudioPermission\("manage_content"\)/);
  assert.match(detail, /getStudioPermission\("manage_content"\)/);
});
test("only an approved correction can be published by an authenticated admin", () => {
  const api = readFileSync("app/api/admin/ekegusii-reviews/[id]/route.ts","utf8");
  const user = readFileSync("src/ekegusii-review-controls.tsx","utf8");
  assert.match(api, /getStudioPermission\("manage_content"\)/);
  assert.match(api, /row.status !== "approved"/);
  assert.match(api, /pathway.steps\[row.step_index\]\?\.reference !== row.scripture_reference/);
  assert.match(api, /ekegusii_published_steps/);
  assert.match(user, /window.confirm/);
  assert.match(user, /Publish approved correction/);
  assert.match(user, /record.status !== "approved"/);
});
test("public display reads published content server-side without disclosing reviewer contact", () => {
  const page = readFileSync("app/ekegusii/pathways/[slug]/page.tsx","utf8");
  const data = readFileSync("src/ekegusii-review-data.ts","utf8");
  assert.match(page, /getPublishedEkegusiiSeed/);
  assert.match(page, /force-dynamic/);
  assert.match(data, /step_index,title,explanation,hook/);
  assert.doesNotMatch(data.slice(data.indexOf("export async function getPublishedEkegusiiSeed")), /reviewer_email/);
});
test("reviewer submissions are persisted securely and integrated into Inbox", () => {
  const submit = readFileSync("app/api/ekegusii/corrections/route.ts","utf8");
  const sql = readFileSync("supabase/migrations/20261022130000_ekegusii_review_workflow.sql","utf8");
  assert.match(submit, /schema.safeParse/);
  assert.match(submit, /pathwayBySlug\(input.pathwaySlug\)/);
  assert.match(submit, /recordWebsiteContactSubmission/);
  assert.match(sql, /enable row level security/g);
  assert.match(sql, /revoke all .* from public, anon, authenticated/g);
  assert.match(sql, /grant all .* to service_role/g);
});
