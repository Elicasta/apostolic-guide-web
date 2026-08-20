import { NextResponse } from "next/server";
import { getSolOperatorSnapshot, scanSolOperator } from "@/sol-operator";
import { runTrustedSolDrafts } from "@/sol-trusted-autopilot";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET?.trim()) return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const before = await getSolOperatorSnapshot();
  if (!before.dbReady) return NextResponse.json({ error: "Sol Operator storage is not configured." }, { status: 503 });

  // Observation is always allowed. Turning Sol off stops execution, not visibility.
  // This keeps proposals, coverage, duplicate reconciliation, and last-scan state fresh.
  const analysis = await scanSolOperator();
  const canAutoRunTrusted = before.settings.enabled && before.settings.mode === "trusted";
  const trusted = canAutoRunTrusted
    ? await runTrustedSolDrafts({ origin: new URL(request.url).origin, cookie: "" })
    : null;

  const execution = !before.settings.enabled
    ? "execution_off"
    : before.settings.mode === "trusted"
      ? "safe_drafts_auto_run"
      : before.settings.mode === "assist"
        ? "approval_required"
        : "observe_only";

  return NextResponse.json({
    ok: true,
    scannedAt: new Date().toISOString(),
    proposals: analysis.proposals.length,
    enabled: before.settings.enabled,
    mode: before.settings.mode,
    execution,
    trusted: trusted ? {
      proposalCount: trusted.proposalIds.length,
      runCount: trusted.runIds.length,
      skipped: trusted.skipped,
      reason: trusted.reason
    } : null
  });
}
