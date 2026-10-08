import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { privateWriteHandlerCalls, resetPrivateWriteHandlerCalls } from "../src/lib/operator/actions/private";
import { publicEffectHandlerCalls, resetPublicEffectHandlerCalls } from "../src/lib/operator/actions/public-effects";
import { resetPrivateWriteAuditCalls, privateWriteAuditCalls } from "../src/lib/operator/audit";
import { executeOperatorCommand } from "../src/lib/operator/execute";
import { interpretOperatorCommand } from "../src/lib/operator/interpret";
import { classifyWorkbenchFile, sniffImageMime } from "../src/grokbot-upload";
import { clearOperatorStoreForTests, resetOperatorSessionsForTests } from "../src/lib/operator/session";
import { OperatorCommandError } from "../src/lib/operator/types";

const owner = { userId: "11111111-1111-4111-8111-111111111111", role: "owner" as const };
const other = { userId: "22222222-2222-4222-8222-222222222222", role: "owner" as const };
const viewer = { userId: "33333333-3333-4333-8333-333333333333", role: "viewer" as const };

function requestId() {
  return randomUUID();
}

test("commands create a durable session and do not invent one for a missing id", async () => {
  const store = resetOperatorSessionsForTests();
  const created = await executeOperatorCommand({ command: "status", actor: owner, requestId: requestId() });
  assert.equal(created.status, "ok");
  assert.equal(created.session.records.length, 1);
  const resumed = await executeOperatorCommand({ command: "list pathways", actor: owner, sessionId: created.session.id });
  assert.equal(resumed.session.id, created.session.id);
  assert.equal(resumed.session.records.length, 2);
  const listed = await store.listSessions(owner.userId, 10);
  assert.equal(listed.length, 1);
  clearOperatorStoreForTests();
  try {
    await assert.rejects(
      () => executeOperatorCommand({ command: "status", actor: owner }),
      (error: unknown) => error instanceof OperatorCommandError && error.name === "OperatorPersistenceUnavailable"
    );
  } finally {
    const active = resetOperatorSessionsForTests();
    await assert.rejects(
      () => executeOperatorCommand({ command: "status", actor: owner, sessionId: randomUUID() }),
      (error: unknown) => error instanceof OperatorCommandError && error.name === "OperatorSessionMissing"
    );
    assert.equal((await active.listSessions(owner.userId, 10)).length, 0);
    await assert.rejects(
      () => executeOperatorCommand({ command: "status", actor: owner, sessionId: "not-a-session" }),
      (error: unknown) => error instanceof OperatorCommandError && error.name === "OperatorSessionInvalid"
    );
    assert.equal((await active.listSessions(owner.userId, 10)).length, 0);
  }
});

test("a second user cannot read or change another user's session, plan, or asset", async () => {
  const store = resetOperatorSessionsForTests();
  resetPrivateWriteHandlerCalls();
  const created = await executeOperatorCommand({ command: "status", actor: owner });
  const denied = await store.readSession(created.session.id, other.userId);
  assert.equal(denied.status, "denied");
  await assert.rejects(
    () => executeOperatorCommand({ command: "status", actor: other, sessionId: created.session.id }),
    (error: unknown) => error instanceof OperatorCommandError && error.name === "OperatorSessionDenied"
  );
  const assetId = randomUUID();
  store.seedAsset({
    id: assetId,
    ownerUserId: owner.userId,
    pathwaySlug: "god-is-one",
    filename: "shema.png",
    mimeType: "image/png",
    bytes: 128,
    storageBucket: "studio-social",
    storagePath: "pathways/god-is-one/carousel/uploaded-image/shema.png",
    publicUrl: null,
    status: "draft"
  });
  const linked = await executeOperatorCommand({
    command: "asset.link",
    action: "asset.link",
    input: { assetId, use: "reference" },
    actor: owner,
    sessionId: created.session.id,
    requestId: requestId()
  });
  assert.equal(linked.status, "ok");
  assert.equal(linked.data.storage, "private");
  assert.equal(linked.data.published, false);
  assert.equal(store.readAsset(assetId)?.publicUrl, null);
  assert.equal(store.readAsset(assetId)?.status, "draft");
  const stolen = await executeOperatorCommand({
    command: "asset.link",
    action: "asset.link",
    input: { assetId, use: "draft_source" },
    actor: other,
    requestId: requestId()
  });
  assert.equal(stolen.status, "blocked");
  assert.equal((await store.listAssets(other.userId, stolen.session.id)).length, 0);
  const plan = await executeOperatorCommand({
    command: "create a 14 day plan",
    actor: owner,
    sessionId: created.session.id,
    requestId: requestId()
  });
  assert.equal(plan.status, "ok");
  assert.equal(plan.action, "plan.create");
  assert.equal(plan.data.saved, true);
  assert.equal(plan.data.published, false);
  const planId = String(plan.data.planId);
  const peeked = await store.getPlan(planId, other.userId);
  assert.equal(peeked.status, "denied");
  const foreignUpdate = await executeOperatorCommand({
    command: "plan.update",
    action: "plan.update",
    input: { planId, expectedRevision: 1, reason: "Attempted cross-user edit." },
    actor: other,
    requestId: requestId()
  });
  assert.equal(foreignUpdate.status, "blocked");
  assert.equal((await store.getPlan(planId, owner.userId)).status, "ok");
});

test("plan edits keep revision history and reject a stale write without overwriting", async () => {
  resetOperatorSessionsForTests();
  resetPrivateWriteHandlerCalls();
  resetPrivateWriteAuditCalls();
  const before = privateWriteHandlerCalls.count;
  const created = await executeOperatorCommand({
    action: "plan.create",
    command: "plan.create",
    input: { days: 14, timezone: "America/New_York" },
    actor: owner,
    requestId: requestId()
  });
  assert.equal(created.status, "ok");
  assert.equal(created.data.published, false);
  assert.equal(created.data.scheduled, false);
  const plan = created.data.plan as { id: string; revision: number; slots: Array<{ id: string; title: string; slotDate: string }> };
  assert.equal(plan.slots.length, 14);
  const request = requestId();
  const updated = await executeOperatorCommand({
    action: "plan.update",
    command: "plan.update",
    input: {
      planId: plan.id,
      expectedRevision: 1,
      reason: "Retitled the first private slot.",
      slots: [{ id: plan.slots[0]!.id, title: "Private Shema study" }]
    },
    actor: owner,
    sessionId: created.session.id,
    requestId: request
  });
  assert.equal(updated.status, "ok");
  assert.equal(updated.data.revision, 2);
  const replay = await executeOperatorCommand({
    action: "plan.update",
    command: "plan.update",
    input: {
      planId: plan.id,
      expectedRevision: 1,
      reason: "This retry must not write again.",
      slots: [{ id: plan.slots[0]!.id, title: "Should not apply" }]
    },
    actor: owner,
    sessionId: created.session.id,
    requestId: request
  });
  assert.equal(replay.summary, updated.summary);
  assert.equal(replay.data.revision, 2);
  const stale = await executeOperatorCommand({
    action: "plan.update",
    command: "plan.update",
    input: { planId: plan.id, expectedRevision: 1, reason: "Stale desk.", slots: [{ id: plan.slots[0]!.id, title: "Overwrite" }] },
    actor: owner,
    sessionId: created.session.id,
    requestId: requestId()
  });
  assert.equal(stale.status, "error");
  assert.equal(stale.data.conflict, true);
  assert.equal(stale.data.overwritten, false);
  assert.equal(stale.data.currentRevision, 2);
  const reordered = await executeOperatorCommand({
    action: "plan.reorder",
    command: "plan.reorder",
    input: {
      planId: plan.id,
      expectedRevision: 2,
      orderedSlotIds: [plan.slots[1]!.id, plan.slots[0]!.id, ...plan.slots.slice(2).map((slot) => slot.id)],
      reason: "Moved day two ahead of day one."
    },
    actor: owner,
    sessionId: created.session.id,
    requestId: requestId()
  });
  assert.equal(reordered.status, "ok");
  const reopened = await executeOperatorCommand({
    action: "plan.inspect",
    command: "plan.inspect",
    input: { planId: plan.id },
    actor: owner,
    sessionId: created.session.id
  });
  const saved = reopened.data.plan as { revision: number; slots: Array<{ title: string; slotDate: string }>; revisions: Array<{ reason: string }> };
  assert.equal(saved.revision, 3);
  assert.equal(saved.slots[1]?.title, "Private Shema study");
  assert.match(saved.revisions.at(-1)?.reason || "", /Moved day two/);
  const duplicate = await executeOperatorCommand({
    action: "plan.duplicate",
    command: "plan.duplicate",
    input: { planId: plan.id },
    actor: owner,
    sessionId: created.session.id,
    requestId: requestId()
  });
  assert.notEqual(duplicate.data.planId, plan.id);
  assert.equal(duplicate.data.revision, 1);
  assert.ok(privateWriteHandlerCalls.count > before);
  assert.ok(privateWriteAuditCalls.count > 0);

  resetPrivateWriteHandlerCalls();
  const blocked = await executeOperatorCommand({
    action: "plan.create",
    command: "plan.create",
    input: { days: 7 },
    actor: viewer,
    requestId: requestId()
  });
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.approvalRequired, false);
  assert.equal(privateWriteHandlerCalls.count, 0);
});

test("scratch survives in the session store and public effects still never run", async () => {
  resetOperatorSessionsForTests();
  resetPublicEffectHandlerCalls();
  resetPrivateWriteHandlerCalls();
  const saved = await executeOperatorCommand({
    action: "scratch.save",
    command: "scratch.save",
    input: { title: "Hook", body: "Why Deut 6:4 still governs the reading.", kind: "hook" },
    actor: owner,
    requestId: requestId()
  });
  assert.equal(saved.status, "ok");
  assert.equal(saved.data.canonical, false);
  const scratchId = String(saved.data.scratchId);
  const listed = await executeOperatorCommand({ command: "show scratch", actor: owner, sessionId: saved.session.id });
  const notes = listed.data.notes as Array<{ id: string; body: string; canonical: false }>;
  assert.equal(notes.some((note) => note.id === scratchId && note.canonical === false), true);
  const missingRequest = await executeOperatorCommand({
    action: "scratch.save",
    command: "scratch.save",
    input: { title: "Nope", body: "Missing request id.", kind: "text" },
    actor: owner,
    sessionId: saved.session.id
  });
  assert.equal(missingRequest.status, "error");
  assert.match(missingRequest.summary, /request id/);
  for (const command of ["publish now", "send a dm", "activate the automation", "enroll this person"]) {
    const blocked = await executeOperatorCommand({ command, actor: owner, sessionId: saved.session.id });
    assert.equal(blocked.status, "blocked");
    assert.equal(blocked.approvalRequired, true);
    assert.equal(blocked.data.externalEffect, false);
  }
  assert.equal(publicEffectHandlerCalls.count, 0);
  const ambiguous = interpretOperatorCommand("update the plan");
  assert.equal(ambiguous.kind, "refused");
  const preview = interpretOperatorCommand("plan next 7 days");
  assert.equal(preview.kind, "action");
  if (preview.kind === "action") assert.equal(preview.action, "content.plan.preview");
});

test("upload classification rejects unsafe files and the workbench uses Pathway Assets", () => {
  assert.equal(sniffImageMime(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0])), "image/png");
  assert.equal(sniffImageMime(Uint8Array.from([0, 1, 2, 3])), null);
  assert.equal(classifyWorkbenchFile({ type: "image/png", size: 1024 }).ok, true);
  assert.equal(classifyWorkbenchFile({ type: "text/html", size: 1024 }).ok, false);
  assert.equal(classifyWorkbenchFile({ type: "image/png", size: 0 }).ok, false);
  const workbench = readFileSync("src/grokbot-workbench.tsx", "utf8");
  const upload = readFileSync("src/grokbot-upload.ts", "utf8");
  const route = readFileSync("app/api/admin/pathway-assets/upload/route.ts", "utf8");
  const bucket = readFileSync("supabase/migrations/202608130002_studio_social_storage.sql", "utf8");
  assert.match(workbench, /uploadWorkbenchFile/);
  assert.match(workbench, /Planning Desk/);
  assert.match(workbench, /type="file"/);
  assert.match(upload, /\/api\/admin\/pathway-assets\/upload/);
  assert.match(upload, /access: "private"/);
  assert.match(route, /createSignedUrl/);
  assert.match(bucket, /'studio-social', 'studio-social', false/);
  assert.doesNotMatch(upload, /public_url/);
});

test("migration keeps grokbot rows owner-only and rejects a stale plan revision", async () => {
  const db = new PGlite();
  const ownerId = "11111111-1111-4111-8111-111111111111";
  const otherId = "22222222-2222-4222-8222-222222222222";
  try {
    await db.exec(`
      create schema if not exists auth;
      create table auth.users(id uuid primary key);
      create or replace function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      create role anon;
      create role authenticated;
      create role service_role;
      create table public.studio_pathway_assets(id uuid primary key);
    `);
    const migration = readFileSync(new URL("../supabase/migrations/20261008050000_grokbot_workbench.sql", import.meta.url), "utf8");
    await db.exec(migration);
    await db.query("insert into auth.users(id) values ($1), ($2)", [ownerId, otherId]);
    const session = await db.query<{ id: string }>("insert into grokbot_sessions(owner_user_id) values ($1) returning id", [ownerId]);
    const sessionId = session.rows[0]!.id;
    await db.query("insert into grokbot_runs(session_id, owner_user_id, request_id, command, status, summary) values ($1,$2,'request-1','status','ok','ok')", [sessionId, ownerId]);
    await assert.rejects(db.query("insert into grokbot_runs(session_id, owner_user_id, request_id, command, status, summary) values ($1,$2,'request-1','status','ok','again')", [sessionId, ownerId]));
    const plan = await db.query<{ id: string }>("insert into grokbot_plans(owner_user_id, session_id, title, starts_on) values ($1,$2,'Plan','2026-10-08') returning id", [ownerId, sessionId]);
    const planId = plan.rows[0]!.id;
    const slot = await db.query<{ id: string }>(
      "insert into grokbot_plan_slots(plan_id, owner_user_id, position, slot_date, title, status, proposal_kind) values ($1,$2,0,'2026-10-08','Shema','idea','article') returning id",
      [planId, ownerId]
    );
    const slots = JSON.stringify([{
      id: slot.rows[0]!.id,
      position: 0,
      slotDate: "2026-10-08",
      title: "Private Shema",
      pathwaySlug: "god-is-one",
      goal: "teaching",
      reason: "Canonical window",
      suggestedTopic: "Shema",
      whyNow: "Now",
      nextSteps: "Review privately",
      dependencies: [],
      status: "draft",
      proposalKind: "article"
    }]);
    const first = await db.query<{ grokbot_save_plan: { ok: boolean; revision: number } }>(
      "select grokbot_save_plan($1,$2,1,'Edited the private slot','Plan','America/New_York',$3::jsonb,$4::jsonb) as grokbot_save_plan",
      [ownerId, planId, JSON.stringify(["title changed"]), slots]
    );
    assert.equal(first.rows[0]!.grokbot_save_plan.ok, true);
    assert.equal(first.rows[0]!.grokbot_save_plan.revision, 2);
    const stale = await db.query<{ grokbot_save_plan: { ok: boolean; conflict: boolean; currentRevision: number } }>(
      "select grokbot_save_plan($1,$2,1,'Stale','Plan','America/New_York',$3::jsonb,$4::jsonb) as grokbot_save_plan",
      [ownerId, planId, JSON.stringify(["nope"]), slots]
    );
    assert.equal(stale.rows[0]!.grokbot_save_plan.conflict, true);
    assert.equal(stale.rows[0]!.grokbot_save_plan.currentRevision, 2);
    const title = await db.query<{ title: string }>("select title from grokbot_plan_slots where id = $1", [slot.rows[0]!.id]);
    assert.equal(title.rows[0]!.title, "Private Shema");
    await db.exec(`select set_config('request.jwt.claim.sub', '${otherId}', false)`);
    await db.exec("set role authenticated");
    const hidden = await db.query<{ count: number }>("select count(*)::integer as count from grokbot_sessions");
    assert.equal(hidden.rows[0]!.count, 0);
    const hiddenPlans = await db.query<{ count: number }>("select count(*)::integer as count from grokbot_plans");
    assert.equal(hiddenPlans.rows[0]!.count, 0);
    await db.exec("reset role");
    await db.exec(`select set_config('request.jwt.claim.sub', '${ownerId}', false)`);
    await db.exec("set role authenticated");
    const visible = await db.query<{ count: number }>("select count(*)::integer as count from grokbot_sessions");
    assert.equal(visible.rows[0]!.count, 1);
  } finally {
    await db.close();
  }
});
