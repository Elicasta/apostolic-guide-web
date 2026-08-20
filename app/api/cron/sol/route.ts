import { NextResponse } from "next/server";
import { runSolManagerCycle } from "@/sol-agent-team";
import { getSolOperatorSnapshot } from "@/sol-operator";
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

  // Intelligence never sleeps. Even with execution turned off, the specialist
  // team still inspects current state so opening Sol never starts from stale data.
  const cycle = await runSolManagerCycle();
  const afterCycle = await getSolOperatorSnapshot();
  const trusted = afterCycle.settings.enabled && afterCycle.settings.mode === "trusted"
    ? await runTrustedSolDrafts({ origin: new URL(request.url).origin, cookie: "" })
    : null;

  return NextResponse.json({
    ok: true,
    scannedAt: new Date().toISOString(),
    intelligence: "active",
    agents: cycle.team.agents.map((agent) => ({ key: agent.key, name: agent.name, state: agent.state })),
    priorities: cycle.team.priorities.length,
    duplicateProposalsSuppressed: cycle.suppressedDuplicateProposals,
    mode: afterCycle.settings.enabled ? afterCycle.settings.mode : "off",
    execution: !afterCycle.settings.enabled
      ? "paused"
      : afterCycle.settings.mode === "trusted"
        ? "safe_drafts_auto_run"
        : afterCycle.settings.mode === "assist"
          ? "approval_required"
          : "observe_only",
    trusted: trusted ? {
      proposalCount: trusted.proposalIds.length,
      runCount: trusted.runIds.length,
      skipped: trusted.skipped,
      reason: trusted.reason
    } : null
  });
}
