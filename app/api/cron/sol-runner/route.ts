import { NextResponse } from "next/server";
import { resumeApprovedForgeAudioRuns } from "@/forge-audio-production";
import { drainForgeCarouselRenderQueue } from "@/forge-carousel-render-worker";
import { executeSolRuns } from "@/sol-operator-executor";
import { listRunnableSolRunIds, recoverStaleSolRuns } from "@/sol-run-recovery";
import { createServiceClient } from "@/supabase";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

async function runtimePolicy() {
  const service = createServiceClient();
  if (!service) throw new Error("Supabase service access is not configured.");
  const result = await service.from("sol_operator_settings")
    .select("enabled,mode")
    .eq("workspace_key", "apostolic-guide")
    .maybeSingle();
  if (result.error) throw result.error;
  return {
    enabled: result.data?.enabled === true,
    mode: String(result.data?.mode || "watch")
  };
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET?.trim()) return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Recovery may reconcile stale state while execution is disabled, but no production
  // work is allowed to advance unless Sol is powered on outside Watch mode.
  const recovery = await recoverStaleSolRuns();
  const policy = await runtimePolicy();
  if (!policy.enabled || policy.mode === "watch") {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: !policy.enabled ? "Sol execution is off." : "Watch mode does not execute work.",
      recovery,
      executed: 0,
      runIds: []
    });
  }

  const reviewResumed = await resumeApprovedForgeAudioRuns();
  const carouselArtwork = await drainForgeCarouselRenderQueue(2);
  const runIds = await listRunnableSolRunIds(3, true);
  if (runIds.length) await executeSolRuns(runIds, { origin: new URL(request.url).origin, cookie: "" });
  return NextResponse.json({ ok: true, reviewResumed, carouselArtwork, recovery, executed: runIds.length, runIds });
}
