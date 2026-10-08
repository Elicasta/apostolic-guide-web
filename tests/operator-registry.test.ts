import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { executeOperatorCommand } from "../src/lib/operator/execute";
import { interpretOperatorCommand } from "../src/lib/operator/interpret";
import { listOperatorActions } from "../src/lib/operator/registry";
import { publicEffectHandlerCalls, resetPublicEffectHandlerCalls } from "../src/lib/operator/actions/public-effects";
import { resetOperatorSessionsForTests } from "../src/lib/operator/session";
import { solLiveAttentionCount, solLivePayloadFromApi } from "../src/sol-live-room-model";

const owner = { userId: "owner-1", role: "owner" as const };
const moderator = { userId: "mod-1", role: "moderator" as const };
const viewer = { userId: "viewer-1", role: "viewer" as const };

test("natural language and short commands resolve only to registered actions", () => {
  const statusCommand = interpretOperatorCommand("status");
  assert.equal(statusCommand.kind, "action");
  if (statusCommand.kind === "action") assert.equal(statusCommand.action, "workspace.status");
  const attention = interpretOperatorCommand("What needs attention this week?");
  assert.equal(attention.kind, "action");
  if (attention.kind === "action") assert.equal(attention.action, "workspace.status");
  const pathway = interpretOperatorCommand("Show me the God Is One Pathway.");
  assert.equal(pathway.kind, "action");
  if (pathway.kind === "action") {
    assert.equal(pathway.action, "pathway.inspect");
    assert.deepEqual(pathway.input, { slug: "god-is-one" });
  }
  const jesus = interpretOperatorCommand("show pathway jesus-is-god");
  assert.equal(jesus.kind, "action");
  if (jesus.kind === "action") assert.deepEqual(jesus.input, { slug: "jesus-is-god" });
  const listed = interpretOperatorCommand("list pathways");
  assert.equal(listed.kind, "action");
  if (listed.kind === "action") assert.equal(listed.action, "pathway.list");
  const waiting = interpretOperatorCommand("What is Sol waiting on?");
  assert.equal(waiting.kind, "action");
  if (waiting.kind === "action") assert.equal(waiting.action, "sol.proposals.list");
  const projects = interpretOperatorCommand("Show me the latest creative projects.");
  assert.equal(projects.kind, "action");
  if (projects.kind === "action") assert.equal(projects.action, "creative.projects.list");
  const plan = interpretOperatorCommand("plan next 7 days");
  assert.equal(plan.kind, "action");
  if (plan.kind === "action") {
    assert.equal(plan.action, "content.plan.preview");
    assert.equal(plan.input.days, 7);
  }
  const feed = interpretOperatorCommand("preview feed");
  assert.equal(feed.kind, "action");
  if (feed.kind === "action") assert.equal(feed.action, "feed.preview");
  const unknown = interpretOperatorCommand("drop table sol_operator_runs");
  assert.equal(unknown.kind, "refused");
  const retry = interpretOperatorCommand("retry job");
  assert.equal(retry.kind, "refused");
});

test("public commands resolve to blocked effect actions and never become shell or SQL", () => {
  for (const command of ["publish now", "send a dm to the list", "activate the automation", "enroll this person"]) {
    const interpreted = interpretOperatorCommand(command);
    assert.equal(interpreted.kind, "action");
    if (interpreted.kind === "action") {
      assert.match(interpreted.action, /^(distribution\.publish|message\.send|automation\.activate|journey\.enroll)$/);
      assert.deepEqual(interpreted.input, {});
    }
  }
});

test("registry exposes read actions and blocks public effects before any handler runs", async () => {
  resetOperatorSessionsForTests();
  resetPublicEffectHandlerCalls();
  const names = listOperatorActions().map((action) => action.name);
  for (const name of ["workspace.status", "pathway.list", "pathway.inspect", "sol.proposals.list", "sol.runs.list", "creative.projects.list", "content.plan.preview", "feed.preview"]) {
    assert.ok(names.includes(name));
  }
  assert.equal(listOperatorActions().some((action) => action.classification === "private_write"), false);
  const pathways = await executeOperatorCommand({ command: "list pathways", actor: owner });
  assert.equal(pathways.status, "ok");
  assert.equal(pathways.action, "pathway.list");
  assert.ok(Array.isArray(pathways.data.pathways));
  const inspected = await executeOperatorCommand({ command: "show pathway god-is-one", actor: owner, sessionId: pathways.session.id });
  assert.equal(inspected.status, "ok");
  assert.equal(inspected.session.context.pathwaySlug, "god-is-one");
  assert.equal(inspected.session.records.length, 2);
  assert.equal(inspected.session.records[0]?.command, "list pathways");
  assert.equal(inspected.session.records[1]?.action, "pathway.inspect");
  const plan = await executeOperatorCommand({ command: "plan next 7 days", actor: owner });
  assert.equal(plan.status, "ok");
  assert.equal(plan.data.published, false);
  assert.equal(plan.data.saved, false);
  const status = await executeOperatorCommand({ command: "what needs attention", actor: owner });
  assert.equal(status.action, "workspace.status");
  assert.equal(status.status, "ok");
  const proposals = await executeOperatorCommand({ command: "show proposals", actor: owner });
  assert.equal(proposals.status, "ok");
  assert.equal(proposals.action, "sol.proposals.list");
  const runs = await executeOperatorCommand({ command: "show runs", actor: owner });
  assert.equal(runs.status, "ok");
  const projects = await executeOperatorCommand({ command: "show creative projects", actor: owner });
  assert.equal(projects.action, "creative.projects.list");
  assert.notEqual(projects.status, "error");
  const feed = await executeOperatorCommand({ command: "preview feed", actor: owner });
  assert.equal(feed.action, "feed.preview");
  assert.equal(feed.data.externalPublish, false);
  const denied = await executeOperatorCommand({ command: "list pathways", actor: moderator });
  assert.equal(denied.status, "blocked");
  assert.equal(denied.action, "pathway.list");
  const probe = await executeOperatorCommand({ command: "publish now", actor: owner });
  assert.equal(probe.status, "blocked");
  assert.equal(probe.approvalRequired, true);
  assert.equal(probe.action, "distribution.publish");
  assert.equal(probe.data.externalEffect, false);
  assert.match(probe.summary, /Nothing was published/);
  assert.equal(publicEffectHandlerCalls.count, 0);
  assert.match(probe.record.summary, /Nothing was published/);
  assert.equal(probe.record.command, "publish now");
});

test("public effects require the action permission before the approval-required block", async () => {
  resetOperatorSessionsForTests();
  resetPublicEffectHandlerCalls();
  const ownerProbe = await executeOperatorCommand({ command: "publish now", actor: owner });
  assert.equal(ownerProbe.status, "blocked");
  assert.equal(ownerProbe.approvalRequired, true);
  assert.equal(ownerProbe.permission, "manage_distribution");
  assert.equal(ownerProbe.data.externalEffect, false);
  assert.match(ownerProbe.summary, /Nothing was published/);
  assert.equal(publicEffectHandlerCalls.count, 0);

  const viewerProbe = await executeOperatorCommand({ command: "publish now", actor: viewer });
  assert.equal(viewerProbe.status, "blocked");
  assert.equal(viewerProbe.approvalRequired, false);
  assert.equal(viewerProbe.action, "distribution.publish");
  assert.equal(viewerProbe.permission, "manage_distribution");
  assert.match(viewerProbe.summary, /role cannot run that action/);
  assert.equal(viewerProbe.data.externalEffect, undefined);
  assert.equal(publicEffectHandlerCalls.count, 0);

  for (const command of ["send a dm", "activate the automation", "enroll this person"]) {
    const denied = await executeOperatorCommand({ command, actor: viewer });
    assert.equal(denied.status, "blocked");
    assert.equal(denied.approvalRequired, false);
    assert.match(denied.summary, /role cannot run that action/);
    assert.equal(publicEffectHandlerCalls.count, 0);
  }

  const ownerEnroll = await executeOperatorCommand({ command: "enroll this person", actor: owner });
  assert.equal(ownerEnroll.approvalRequired, true);
  assert.equal(ownerEnroll.permission, "manage_journeys");
  assert.equal(ownerEnroll.data.externalEffect, false);
  assert.equal(publicEffectHandlerCalls.count, 0);
});

test("live Sol payload keeps operational state and ignores missing snapshots", () => {
  const payload = solLivePayloadFromApi({
    generatedAt: "2026-10-07T12:00:00.000Z",
    dbReady: true,
    settings: { enabled: true, mode: "assist", lastScanAt: null },
    proposals: [{ id: "p1", title: "Draft", summary: "Ready", status: "pending", priority: "high", risk: "safe_draft", pathwaySlugs: ["god-is-one"], updatedAt: "2026-10-07T12:00:00.000Z" }],
    runs: [{ id: "r1", recipeKey: "carousel", pathwaySlug: "god-is-one", status: "running", progress: 40, currentStep: "render", error: null, updatedAt: "2026-10-07T12:00:00.000Z" }],
    recentActivity: [{ id: "r0", recipeKey: "carousel", pathwaySlug: null, status: "completed", progress: 100, currentStep: null, error: null, updatedAt: "2026-10-07T11:00:00.000Z" }],
    kpis: [{ key: "carousel", label: "Carousel", actual: 1, target: 3 }],
    coverage: { pathways: 12, audioReady: 2, youtubePublished: 1, carouselPublished: 1, automationsLinked: 0 },
    team: { agents: [{ key: "production", name: "Forge", role: "Production", state: "working", summary: "Moving", nextAction: "Finish the render" }], priorities: [{ severity: "high", label: "Clear review gates", detail: "One job is waiting." }] }
  });
  assert.ok(payload);
  assert.equal(payload?.settings.mode, "assist");
  assert.equal(solLiveAttentionCount(payload!).pending, 1);
  assert.equal(payload?.recentActivity[0]?.status, "completed");
  assert.equal(solLivePayloadFromApi({}), null);
});

test("Sol live room and Grokbot keep motion and public effects behind the registry", () => {
  const liveCss = readFileSync("app/admin/sol-live-room.css", "utf8");
  const page = readFileSync("app/admin/sol/page.tsx", "utf8");
  const grokbot = readFileSync("app/admin/grokbot/page.tsx", "utf8");
  const nav = readFileSync("src/studio-nav.tsx", "utf8");
  const execute = readFileSync("src/lib/operator/execute.ts", "utf8");
  assert.match(liveCss, /prefers-reduced-motion:\s*reduce/);
  assert.match(page, /SolLiveRoom/);
  assert.match(grokbot, /GrokbotWorkbench/);
  assert.match(nav, /\/admin\/grokbot/);
  assert.match(execute, /public_effect/);
  assert.match(execute, /externalEffect: false/);
  const permissionAt = execute.indexOf("hasStudioPermission");
  const publicAt = execute.indexOf("classification === \"public_effect\"");
  assert.ok(permissionAt > 0 && permissionAt < publicAt);
});
