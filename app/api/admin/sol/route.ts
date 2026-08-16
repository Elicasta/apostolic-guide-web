import { after, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminAccess } from "@/auth";
import { getSolAdminSurface } from "@/sol-admin-context";
import { hasStudioPermission } from "@/studio-permissions";
import { executeSolRuns } from "@/sol-operator-executor";
import { interpretSolMessage } from "@/sol-operator-chat";
import { runTrustedSolDrafts } from "@/sol-trusted-autopilot";
import {
  approveSolProposal,
  cancelSolRun,
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
  z.object({
    action: z.literal("chat"),
    message: z.string().trim().min(1).max(2000),
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

export async function GET() {
  const access = await requireAccess();
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await getSolOperatorSnapshot());
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
      return NextResponse.json({ ok: true, message: `Started ${approved.runIds.length} ${approved.runIds.length === 1 ? "run" : "runs"}.`, snapshot: await getSolOperatorSnapshot() });
    }
    if (body.action === "dismiss") {
      await dismissSolProposal(body.proposalId, access.user.id);
      return NextResponse.json({ ok: true, snapshot: await getSolOperatorSnapshot() });
    }
    if (body.action === "cancel_run") {
      await cancelSolRun(body.runId, access.user.id);
      return NextResponse.json({ ok: true, snapshot: await getSolOperatorSnapshot() });
    }

    const snapshot = await getSolOperatorSnapshot();
    const surface = getSolAdminSurface(body.context?.pathname ?? "/admin");
    const decision = await interpretSolMessage(body.message, snapshot, surface);
    let message = decision.reply;
    if (decision.action === "scan") {
      const trusted = await scanAndRunTrusted(access.user.id, request);
      if (trusted.runIds.length) message = `${decision.reply} Trusted mode safely ran ${trusted.runIds.length} draft ${trusted.runIds.length === 1 ? "job" : "jobs"}.`;
    } else if (decision.action === "set_settings") {
      await updateSolSettings({ enabled: decision.enabled ?? snapshot.settings.enabled, mode: decision.mode ?? snapshot.settings.mode, weeklyTargets: snapshot.settings.weeklyTargets }, access.user.id);
    } else if (decision.action === "approve") {
      const runIds: string[] = [];
      for (const proposalId of decision.proposalIds) {
        const approved = await approveSolProposal(proposalId, decision.constraints, access.user.id);
        runIds.push(...approved.runIds);
      }
      if (runIds.length) {
        const context = executionContext(request);
        after(() => executeSolRuns(runIds, context));
        message = `${decision.reply} ${runIds.length} ${runIds.length === 1 ? "run is" : "runs are"} now tracked in Sol.`;
      }
    } else if (decision.action === "dismiss") {
      for (const proposalId of decision.proposalIds) await dismissSolProposal(proposalId, access.user.id);
    }
    return NextResponse.json({ ok: true, message, decision: { action: decision.action, constraints: decision.constraints }, surface, snapshot: await getSolOperatorSnapshot() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Sol Operator request failed." }, { status: 500 });
  }
}
