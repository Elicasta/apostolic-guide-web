import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/supabase";

export const runtime = "nodejs";

const schema = z.object({
  job_id: z.string().uuid(),
  token: z.string().min(32).max(256),
  status: z.enum(["rendering", "completed", "failed"]),
  error: z.string().max(2000).optional()
});

type BridgeSnapshot = {
  callbackTokenHash?: string;
  storagePath?: string;
  publicUrl?: string;
};

function tokenMatches(raw: string, expected: string) {
  const actual = createHash("sha256").update(raw).digest();
  const wanted = Buffer.from(expected, "hex");
  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid renderer callback." }, { status: 400 });

  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Renderer callback is unavailable." }, { status: 503 });

  const renderResult = await service.from("pathway_video_renders")
    .select("id,asset_id,status,config_snapshot")
    .eq("id", parsed.data.job_id)
    .maybeSingle();
  if (renderResult.error) return NextResponse.json({ error: renderResult.error.message }, { status: 500 });
  if (!renderResult.data) return NextResponse.json({ error: "Render job not found." }, { status: 404 });

  const snapshot = (renderResult.data.config_snapshot ?? {}) as { rendererBridge?: BridgeSnapshot };
  const bridge = snapshot.rendererBridge ?? {};
  if (!bridge.callbackTokenHash || !tokenMatches(parsed.data.token, bridge.callbackTokenHash)) {
    return NextResponse.json({ error: "Invalid renderer token." }, { status: 403 });
  }

  const now = new Date().toISOString();
  if (parsed.data.status === "rendering") {
    const update = await service.from("pathway_video_renders").update({
      status: "rendering",
      started_at: now,
      error: null
    }).eq("id", renderResult.data.id);
    if (update.error) return NextResponse.json({ error: update.error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (parsed.data.status === "failed") {
    const error = parsed.data.error?.trim() || "Renderer failed without an error message.";
    const updates = [
      service.from("pathway_video_renders").update({
        status: "failed",
        error,
        completed_at: now
      }).eq("id", renderResult.data.id)
    ];
    if (renderResult.data.asset_id) {
      updates.push(service.from("pathway_assets").update({
        status: "blocked",
        notes: `Video Studio render failed: ${error.slice(0, 1500)}`,
        updated_at: now
      }).eq("id", renderResult.data.asset_id));
    }
    const results = await Promise.all(updates);
    const failed = results.find((result) => result.error);
    if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (!bridge.storagePath || !bridge.publicUrl) {
    return NextResponse.json({ error: "Render bridge output metadata is missing." }, { status: 409 });
  }

  const updates = [
    service.from("pathway_video_renders").update({
      status: "completed",
      storage_path: bridge.storagePath,
      output_url: bridge.publicUrl,
      completed_at: now,
      error: null
    }).eq("id", renderResult.data.id)
  ];
  if (renderResult.data.asset_id) {
    updates.push(service.from("pathway_assets").update({
      status: "ready_to_publish",
      file_url: bridge.publicUrl,
      updated_at: now
    }).eq("id", renderResult.data.asset_id));
  }
  const results = await Promise.all(updates);
  const failed = results.find((result) => result.error);
  if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 500 });

  return NextResponse.json({ ok: true, output_url: bridge.publicUrl });
}
