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
import { hasStudioPermission } from "@/studio-permissions";
import { executeSolRuns } from "@/sol-operator-executor";
import { adoptLegacyWaitingReviews } from "@/sol-runtime-adoption";
import { routeKnownSolRequest } from "@/sol-runtime-router";
import { runSolRuntimeWorker } from "@/sol-runtime-worker";
import { cancelSolRunV3, retrySolRun } from "@/sol-run-recovery";
import { runTrustedSolDrafts } from "@/sol-trusted-autopilot";
import {
  approveSolProposal,
  dismissSolProposal,
  getSolOperatorSnapshot,
  scanSolOperator,
  updateSolSettings
} from "@/sol-operator";

export const runtime = "nodejs";
export const maxDuration = 300;

const settingsSchema = z.object({
  action: z.literal("update_settings"),
  enabled: z.boolean(),
  mode: z.enum(["watch", "assist", "trusted"]),
  weeklyTargets: z.record(z.string(), z.number().int().min(0).max(99)).optional()
});
const actionSchema = z.discriminatedUnion("action", [
  settingsSchema,
  z.object({ action: z.literal("scan") }),
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

async function scanAndRunTrusted(actorUserId: string, request: Request) {
  await scanSolOperator(actorUserId);
  const scanned = await getSolOperatorSnapshot();
  if (!scanned.settings.enabled || scanned.settings.mode !== "trusted") return { runIds: [] as string[] };
  return runTrustedSolDrafts(executionContext(request));
}

export async function GET(request: Request) {
  const access = await requireAccess();
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(request.url);
  try {
    await adoptLegacyWaitingReviews();
  } catch (error) {
    console.error("SOL Runtime review adoption failed", error);
  }
  const snapshot = await getSolOperatorSnapshot();
  if (url.searchParams.get("agent") !== "1") return NextResponse.json(snapshot);
  const pathname = url.searchParams.get("pathname") || "/admin";
  return NextResponse.json({ snapshot, thread: await getSolAgentThread(access.user.id, pathname), surface: getSolAdminSurface(pathname) });
}

export async function POST(request: Request) {
  const access = await requireAccess();
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid Sol Operator request." }, { status: 400 });
  const body = parsed.data;
  const canOperate = hasStudioPermission(access.role, "manage_content");
  if (!canOperate) return NextResponse.json({ error: "Your Studio role can view Sol but cannot run it." }, { status: 403 });

  try {
    if (body.action === "update_settings") {
      await updateSolSettings(body, access.user.id);
      return NextResponse.json({ ok: true, snapshot: await getSolOperatorSnapshot() });
    }
    if (body.action === "scan") {
      const trusted = await scanAndRunTrusted(access.user.id, request);
      const autoMessage = trusted.runIds.length ? ` Trusted mode safely ran ${trusted.runIds.length} draft ${trusted.runIds.length === 1 ? "job" : "jobs"}.` : "";
      return NextResponse.json({ ok: true, message: `Workspace scan complete.${autoMessage}`, snapshot: await getSolOperatorSnapshot() });
    }
    if (body.action === "approve") {
      const approved = await approveSolProposal(body.proposalId, body.constraints, access.user.id);
      const context = executionContext(request);
      after(() => executeSolRuns(approved.runIds, context));
      return NextResponse.json({ ok: true, message: `Started or reused ${approved.runIds.length} ${approved.runIds.length === 1 ? "run" : "runs"}.`, snapshot: await getSolOperatorSnapshot() });
    }
    if (body.action === "dismiss") {
      await dismissSolProposal(body.proposalId, access.user.id);
      return NextResponse.json({ ok: true, snapshot: await getSolOperatorSnapshot() });
    }
    if (body.action === "cancel_run") {
      await cancelSolRunV3(body.runId, access.user.id);
      return NextResponse.json({ ok: true, snapshot: await getSolOperatorSnapshot() });
    }
    if (body.action === "retry_run") {
      await retrySolRun(body.runId, access.user.id);
      const context = executionContext(request);
      after(() => executeSolRuns([body.runId], context));
      return NextResponse.json({ ok: true, message: "Run queued for retry.", snapshot: await getSolOperatorSnapshot() });
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
        return NextResponse.json({ ok: true, message, thread: await getSolAgentThread(access.user.id, pathname), snapshot: await getSolOperatorSnapshot(), surface });
      }
      const result = await executeApprovedSolAgentTool({ approval, actorUserId: access.user.id, threadId: thread.id, surface, snapshot: await getSolOperatorSnapshot() });
      await appendSolAgentMessage({ threadId: thread.id, role: "tool", kind: "tool_result", content: result.message, metadata: { approvalId: approval.id, approved: true, ok: result.ok, runIds: result.runIds ?? [] } });
      await appendSolAgentMessage({ threadId: thread.id, role: "assistant", content: result.message, metadata: { approvalId: approval.id, decision: "approved" } });
      if (result.runIds?.length) {
        const context = executionContext(request);
        after(() => executeSolRuns(result.runIds ?? [], context));
      }
      return NextResponse.json({ ok: result.ok, message: result.message, thread: await getSolAgentThread(access.user.id, pathname), snapshot: await getSolOperatorSnapshot(), surface });
    }

    const pathname = body.context?.pathname ?? "/admin";
    const surface = getSolAdminSurface(pathname);
    const snapshot = await getSolOperatorSnapshot();
    if (snapshot.settings.enabled && snapshot.settings.mode !== "watch") {
      const runtimeRequest = await routeKnownSolRequest({ message: body.message, userId: access.user.id, mode: snapshot.settings.mode });
      if (runtimeRequest) {
        const thread = await getSolAgentThread(access.user.id, pathname);
        if (thread) {
          await appendSolAgentMessage({ threadId: thread.id, role: "user", content: body.message, metadata: { runtime: true } });
          const message = runtimeRequest.reused
            ? `That work already exists. I reused runtime run ${runtimeRequest.runId.slice(0, 8)} instead of creating a duplicate.`
            : `Started ${runtimeRequest.intent.workflowKey}. I will execute the durable task graph, verify the outputs, and stop at any required approval.`;
          await appendSolAgentMessage({ threadId: thread.id, role: "assistant", content: message, metadata: { runtime: true, runId: runtimeRequest.runId, reused: runtimeRequest.reused, workflow: runtimeRequest.intent.workflowKey } });
        }
        after(() => runSolRuntimeWorker({ maxTasks: 24 }));
        return NextResponse.json({
          ok: true,
          message: runtimeRequest.reused ? "Equivalent work already exists. SOL reused the existing durable run." : "SOL Runtime started the workflow. It will continue independently of this browser session.",
          runtime: { runId: runtimeRequest.runId, reused: runtimeRequest.reused, executionGeneration: runtimeRequest.executionGeneration, workflow: runtimeRequest.intent.workflowKey, intent: runtimeRequest.intent.intent },
          thread: await getSolAgentThread(access.user.id, pathname),
          snapshot,
          surface,
          agent: { turnId: null, toolCount: 0 }
        });
      }
    }

    const turn = await runSolAgentTurn({ actorUserId: access.user.id, message: body.message, surface });
    if (turn.runIds.length) {
      const context = executionContext(request);
      after(() => executeSolRuns(turn.runIds, context));
    }
    return NextResponse.json({ ok: true, message: turn.message, thread: turn.thread, snapshot: turn.snapshot, surface, agent: { turnId: turn.turnId, toolCount: turn.toolCount } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Sol Operator request failed." }, { status: 500 });
  }
}
