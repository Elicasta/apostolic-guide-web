import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/supabase";
import { workerTokenMatches } from "@/video-producer-server";

export const runtime = "nodejs";

const schema = z.object({
  renderId: z.string().uuid(),
  token: z.string().min(1),
  status: z.enum(["completed", "failed"]),
  error: z.string().optional()
});

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid callback." }, { status: 400 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Service unavailable." }, { status: 503 });

  const result = await service.from("pathway_video_renders")
    .select("id,status,asset_id,config_snapshot")
    .eq("id", parsed.data.renderId).maybeSingle();
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
  const render = result.data;
  if (!render) return NextResponse.json({ error: "Render not found." }, { status: 404 });
  if (render.status === "completed") return NextResponse.json({ ok: true, replay: true });

  const snapshot = record(render.config_snapshot);
  const bridge = record(snapshot.publisherBridge);
  const expectedHash = typeof bridge.callbackTokenHash === "string" ? bridge.callbackTokenHash : "";
  if (!expectedHash || !workerTokenMatches(parsed.data.token, expectedHash)) return NextResponse.json({ error: "Invalid or expired callback token." }, { status: 403 });
  const publicUrl = typeof bridge.publicUrl === "string" ? bridge.publicUrl : null;
  const storagePath = typeof bridge.storagePath === "string" ? bridge.storagePath : null;
  const now = new Date().toISOString();

  const terminalSnapshot = {
    ...snapshot,
    publisherBridge: { ...bridge, callbackTokenHash: null, completedAt: now }
  };
  if (parsed.data.status === "completed") {
    if (!publicUrl || !storagePath) return NextResponse.json({ error: "Publisher destination metadata is incomplete." }, { status: 500 });
    const update = await service.from("pathway_video_renders").update({
      status: "completed",
      output_url: publicUrl,
      storage_path: storagePath,
      error: null,
      config_snapshot: terminalSnapshot,
      completed_at: now
    }).eq("id", render.id);
    if (update.error) return NextResponse.json({ error: update.error.message }, { status: 500 });
    if (render.asset_id) {
      await service.from("pathway_assets").update({
        status: "ready_to_publish",
        file_url: publicUrl,
        notes: "Ready in Publisher. Produced and reviewed in Video Producer.",
        updated_at: now
      }).eq("id", render.asset_id);
    }
    return NextResponse.json({ ok: true });
  }

  const message = parsed.data.error || "Publisher handoff worker failed.";
  const failed = await service.from("pathway_video_renders").update({
    status: "failed",
    error: message,
    config_snapshot: terminalSnapshot,
    completed_at: now
  }).eq("id", render.id);
  if (failed.error) return NextResponse.json({ error: failed.error.message }, { status: 500 });
  if (render.asset_id) {
    await service.from("pathway_assets").update({ status: "blocked", notes: `Video Producer Publisher handoff failed: ${message}`, updated_at: now }).eq("id", render.asset_id);
  }
  return NextResponse.json({ ok: true });
}
