import { NextResponse } from "next/server";
import { resumeApprovedForgeAudioRuns } from "@/forge-audio-production";
import { executeSolRuns } from "@/sol-operator-executor";
import { listRunnableSolRunIds, recoverStaleSolRuns } from "@/sol-run-recovery";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET?.trim()) return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const reviewResumed = await resumeApprovedForgeAudioRuns();
  const recovery = await recoverStaleSolRuns();
  const runIds = await listRunnableSolRunIds(3, true);
  if (runIds.length) await executeSolRuns(runIds, { origin: new URL(request.url).origin, cookie: "" });
  return NextResponse.json({ ok: true, reviewResumed, recovery, executed: runIds.length, runIds });
}
