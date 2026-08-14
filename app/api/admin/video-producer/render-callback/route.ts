import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/supabase";
import { workerTokenMatches } from "@/video-producer-server";

export const runtime = "nodejs";

const schema = z.object({
  job_id: z.string().uuid(),
  token: z.string().min(32).max(256),
  status: z.enum(["rendering", "completed", "failed"]),
  progress: z.number().int().min(0).max(100).optional(),
  stage: z.string().min(1).max(100).optional(),
  error: z.string().max(3000).optional()
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid render callback." }, { status: 400 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Render callback is unavailable." }, { status: 503 });

  const renderResult = await service.from("video_producer_renders")
    .select("id,project_id,status,started_at,config_snapshot")
    .eq("id", parsed.data.job_id)
    .maybeSingle();
  if (renderResult.error) return NextResponse.json({ error: renderResult.error.message }, { status: 500 });
  if (!renderResult.data) return NextResponse.json({ error: "Render job not found." }, { status: 404 });
  const snapshot = renderResult.data.config_snapshot && typeof renderResult.data.config_snapshot === "object"
    ? renderResult.data.config_snapshot as Record<string, unknown>
    : {};
  const bridge = snapshot.rendererBridge && typeof snapshot.rendererBridge === "object"
    ? snapshot.rendererBridge as Record<string, unknown>
    : {};
  if (typeof bridge.callbackTokenHash !== "string" || !workerTokenMatches(parsed.data.token, bridge.callbackTokenHash)) {
    return NextResponse.json({ error: "Invalid render token." }, { status: 403 });
  }

  const now = new Date().toISOString();
  const progress = {
    percent: parsed.data.progress ?? (parsed.data.status === "completed" ? 100 : 1),
    stage: parsed.data.stage ?? (parsed.data.status === "completed" ? "Ready to review" : parsed.data.status === "failed" ? "Render failed" : "Rendering"),
    heartbeatAt: now
  };

  if (parsed.data.status === "rendering") {
    const values: Record<string, unknown> = { status: "rendering", progress, error: null };
    if (!renderResult.data.started_at) values.started_at = now;
    const update = await service.from("video_producer_renders").update(values).eq("id", renderResult.data.id);
    if (update.error) return NextResponse.json({ error: update.error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (parsed.data.status === "failed") {
    const error = parsed.data.error?.trim() || "Render worker failed.";
    const [renderUpdate, projectUpdate] = await Promise.all([
      service.from("video_producer_renders").update({ status: "failed", progress, error, completed_at: now }).eq("id", renderResult.data.id),
      service.from("video_producer_projects").update({ status: "approved" }).eq("id", renderResult.data.project_id)
    ]);
    if (renderUpdate.error || projectUpdate.error) return NextResponse.json({ error: renderUpdate.error?.message || projectUpdate.error?.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (typeof bridge.outputPath !== "string" || !bridge.outputPath) return NextResponse.json({ error: "Render output locator is missing." }, { status: 409 });
  const completedSnapshot = {
    ...snapshot,
    rendererBridge: { ...bridge, callbackTokenHash: null, completedAt: now }
  };
  const [renderUpdate, projectUpdate] = await Promise.all([
    service.from("video_producer_renders").update({
      status: "completed",
      progress: { percent: 100, stage: parsed.data.stage ?? "Ready to review", heartbeatAt: now },
      output_storage_path: bridge.outputPath,
      output_url: null,
      error: null,
      completed_at: now,
      config_snapshot: completedSnapshot
    }).eq("id", renderResult.data.id),
    service.from("video_producer_projects").update({ status: "review" }).eq("id", renderResult.data.project_id)
  ]);
  if (renderUpdate.error || projectUpdate.error) return NextResponse.json({ error: renderUpdate.error?.message || projectUpdate.error?.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
