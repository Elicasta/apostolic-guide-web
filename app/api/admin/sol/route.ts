import { after, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminAccess } from "@/auth";
import { getSolAdminSurface } from "@/sol-admin-context";
import { runSolAgentTurn } from "@/sol-agent-kernel";
import {
  appendSolAgentMessage,
  getSolAgentApproval,
  getSolAgentThread,
  resolveSolAgentApproval
} from "@/sol-agent-memory";
import { executeApprovedSolAgentTool } from "@/sol-agent-tools";
import { getSolAgentTeamSnapshot, runSolManagerCycle } from "@/sol-agent-team";
import { hasStudioPermission } from "@/studio-permissions";
import { decideSolControl } from "@/sol-control-policy";
import { stopSolOperator } from "@/sol-stop";
import { executeSolRuns } from "@/sol-operator-executor";
import { cancelSolRunV3, retrySolRun } from "@/sol-run-recovery";
import { runTrustedSolDrafts } from "@/sol-trusted-autopilot";
import {
  approveSolProposal,
  dismissSolProposal,
  getSolOperatorSnapshot,
  updateSolSettings
} from "@/sol-operator";

export const runtime = "nodejs";
export const maxDuration = 300;

const settingsSchema = z.object({
  action: z.literal("update_settings"),
  enabled: z.boolean(),
  mode: z.enum(["watch", "assist", "trusted"]),
  weeklyTargets: z.record(z.string(), z.number().int().min(0).max(99)).optional(),
  acknowledged: z.boolean().optional()
});
const actionSchema = z.discriminatedUnion("action", [
  settingsSchema,
  z.object({ action: z.literal("scan") }),
  z.object({ action: z.literal("stop"), confirm: z.literal(true) }),
  z.object({ action: z.literal("approve"), proposalId: z.string().uuid(), constraints: z.array(z.string().trim().min(1).max(240)).max(12).default([]) }),
  z.object({ action: z.literal("dismiss"), proposalId: z.string().uuid() }),
  z.object({ action: z.literal("cancel_run"), runId: z.string().uuid() }),
  z.object({ action: z.literal("retry_run"), runId: z.string().uuid() }),
  z.object({ action: z.literal("agent_approval"), approvalId: z.string().uuid(), decision: z.enum(["approved", "rejected"]), context: z.object({ pathname: z.string().trim().max(500) }).optional() }),
  z.object({
    action: z.literal("chat"),
    message: z.string().trim().min(1).max(4000),
    context: z.object({ pathname: z.string().trim().max(500) }).optional()
  })
]);

async function requireAccess() {
  const access = await getAdminAccess();
  if (access.state !== "allowed" || !access.user || !access.role || !hasStudioPermission(access.role, "view_workspace")) return null;
  return access;
}

function executionContext(request: Request) {
  return { origin: new URL(request.url).origin, cookie: request.headers.get("cookie") ?? "" };
}

async function snapshotAndTeam() {
  const [snapshot, team] = await Promise.all([getSolOperatorSnapshot(), getSolAgentTeamSnapshot()]);
  return { snapshot, team };
}

async function scanAndRunTrusted(actorUserId: string, request: Request) {
  const cycle = await runSolManagerCycle(actorUserId);
  const scanned = await getSolOperatorSnapshot();
  if (!scanned.settings.enabled || scanned.settings.mode !== "trusted") return { runIds: [] as string[], cycle };
  const trusted = await runTrustedSolDrafts(executionContext(request));
  return { ...trusted, cycle };
}

export async function GET(request: Request) {
  const access = await requireAccess();
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(request.url);
  const { snapshot, team } = await snapshotAndTeam();
  if (url.searchParams.get("agent") !== "1") return NextResponse.json({ ...snapshot, team });
  const pathname = url.searchParams.get("pathname") || "/admin";
  return NextResponse.json({ snapshot, team, thread: await getSolAgentThread(access.user.id, pathname), surface: getSolAdminSurface(pathname) });
}

export async function POST(request: Request) {
  const access = await requireAccess();
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Cross-origin Sol changes are not permitted." }, { status: 403 });
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid Sol Operator request." }, { status: 400 });
  const body = parsed.data;
  const canOperate = hasStudioPermission(access.role, "manage_content");
  if (!canOperate) return NextResponse.json({ error: "Your Studio role can view Sol but cannot run it." }, { status: 403 });

  const current = await getSolOperatorSnapshot();
  if (!current.dbReady && body.action !== "chat") return NextResponse.json({ error: "Sol storage is unavailable. No changes were made." }, { status: 503 });
  const action = body.action === "update_settings" ? "settings" : body.action === "agent_approval" ? "agent_approval" : body.action === "cancel_run" ? "cancel" : body.action === "retry_run" ? "retry" : body.action;
  const policy = decideSolControl({
    role: access.role, action, enabled: current.settings.enabled, mode: current.settings.mode,
    ...(body.action === "update_settings" ? { nextEnabled: body.enabled, nextMode: body.mode, acknowledged: body.acknowledged } : {}),
    via: "page"
  });
  if (!policy.allow) return NextResponse.json({ code: policy.code, error: policy.message }, { status: policy.code === "CONFIRM_REQUIRED" || policy.code === "SOL_PAUSED" ? 409 : 403 });

  try {
    if (body.action === "stop") {
      const stopped = await stopSolOperator(access.user.id);
      return NextResponse.json({ ok: true, stopped, message: "Sol was stopped. Queued work and pending approvals were cancelled.", ...await snapshotAndTeam() });
    }
    if (body.action === "update_settings") {
      await updateSolSettings(body, access.user.id);
      return NextResponse.json({ ok: true, ...await snapshotAndTeam() });
    }
    if (body.action === "scan") {
      const trusted = await scanAndRunTrusted(access.user.id, request);
      const autoMessage = trusted.runIds.length ? ` Trusted mode safely ran ${trusted.runIds.length} draft ${trusted.runIds.length === 1 ? "job" : "jobs"}.` : "";
      return NextResponse.json({ ok: true, message: `Manager cycle complete.${autoMessage}`, ...await snapshotAndTeam(), manager: trusted.cycle });
    }
    if (body.action === "approve") {
      const approved = await approveSolProposal(body.proposalId, body.constraints, access.user.id);
      const context = executionContext(request);
      after(() => executeSolRuns(approved.runIds, context));
      return NextResponse.json({ ok: true, message: `Started ${approved.runIds.length} ${approved.runIds.length === 1 ? "run" : "runs"}.`, ...await snapshotAndTeam() });
    }
    if (body.action === "dismiss") {
      await dismissSolProposal(body.proposalId, access.user.id);
      return NextResponse.json({ ok: true, ...await snapshotAndTeam() });
    }
    if (body.action === "cancel_run") {
      await cancelSolRunV3(body.runId, access.user.id);
      return NextResponse.json({ ok: true, ...await snapshotAndTeam() });
    }
    if (body.action === "retry_run") {
      await retrySolRun(body.runId, access.user.id);
      const context = executionContext(request);
      after(() => executeSolRuns([body.runId], context));
      return NextResponse.json({ ok: true, message: "Run queued for retry.", ...await snapshotAndTeam() });
    }
    if (body.action === "agent_approval") {
      const approval = await getSolAgentApproval(body.approvalId, access.user.id);
      if (!approval || approval.status !== "pending") return NextResponse.json({ error: "That approval is no longer pending." }, { status: 409 });
      const pathname = body.context?.pathname ?? "/admin";
      const surface = getSolAdminSurface(pathname);
      const thread = await getSolAgentThread(access.user.id, pathname);
      if (!thread) return NextResponse.json({ error: "Sol agent memory is not ready." }, { status: 503 });
      await resolveSolAgentApproval({ approvalId: approval.id, userId: access.user.id, decision: body.decision });
      if (body.decision === "rejected") {
        const message = `Cancelled approval: ${approval.summary} Nothing was changed.`;
        await appendSolAgentMessage({ threadId: thread.id, role: "assistant", content: message, metadata: { approvalId: approval.id, decision: "rejected" } });
        const { snapshot, team } = await snapshotAndTeam();
        return NextResponse.json({ ok: true, message, thread: await getSolAgentThread(access.user.id, pathname), snapshot, team, surface });
      }
      const result = await executeApprovedSolAgentTool({ approval, actorUserId: access.user.id, threadId: thread.id, surface, snapshot: await getSolOperatorSnapshot() });
      await appendSolAgentMessage({ threadId: thread.id, role: "tool", kind: "tool_result", content: result.message, metadata: { approvalId: approval.id, approved: true, ok: result.ok, runIds: result.runIds ?? [] } });
      await appendSolAgentMessage({ threadId: thread.id, role: "assistant", content: result.message, metadata: { approvalId: approval.id, decision: "approved" } });
      if (result.runIds?.length) {
        const context = executionContext(request);
        after(() => executeSolRuns(result.runIds ?? [], context));
      }
      const { snapshot, team } = await snapshotAndTeam();
      return NextResponse.json({ ok: result.ok, message: result.message, thread: await getSolAgentThread(access.user.id, pathname), snapshot, team, surface });
    }

    const surface = getSolAdminSurface(body.context?.pathname ?? "/admin");
    const turn = await runSolAgentTurn({ actorUserId: access.user.id, message: body.message, surface });
    if (turn.runIds.length) {
      const context = executionContext(request);
      after(() => executeSolRuns(turn.runIds, context));
    }
    const team = await getSolAgentTeamSnapshot();
    return NextResponse.json({ ok: true, message: turn.message, thread: turn.thread, snapshot: turn.snapshot, team, surface, agent: { turnId: turn.turnId, toolCount: turn.toolCount } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sol Operator request failed.";
    const conflict = /already|expired|no longer|changed|claimed|pending|paused/i.test(message);
    return NextResponse.json({ error: message, ...(conflict ? { code: "PREVIEW_STALE" } : {}) }, { status: conflict ? 409 : 500 });
  }
}
