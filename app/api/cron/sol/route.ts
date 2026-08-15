import { NextResponse } from "next/server";
import { getSolOperatorSnapshot, scanSolOperator } from "@/sol-operator";

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
  if (!before.settings.enabled) return NextResponse.json({ ok: true, skipped: true, reason: "Sol is turned off." });

  const analysis = await scanSolOperator();
  return NextResponse.json({
    ok: true,
    scannedAt: new Date().toISOString(),
    proposals: analysis.proposals.length,
    mode: before.settings.mode,
    execution: "approval_required"
  });
}
