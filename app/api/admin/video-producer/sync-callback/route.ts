import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/supabase";
import { workerTokenMatches } from "@/video-producer-server";

export const runtime = "nodejs";

const schema = z.object({
  project_id: z.string().uuid(),
  asset_id: z.string().uuid(),
  token: z.string().min(16),
  status: z.enum(["syncing", "completed", "failed"]),
  progress: z.number().int().min(0).max(100).optional(),
  stage: z.string().max(300).optional(),
  error: z.string().max(3000).optional(),
  result: z.object({
    offset_seconds: z.number().finite(),
    confidence: z.number().min(0).max(1),
    status: z.enum(["synced", "needs_review"]),
    asset_duration: z.number().positive(),
    has_audio: z.boolean(),
    method: z.string().max(80),
    metadata: z.record(z.string(), z.unknown()).optional()
  }).optional()
});

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid sync callback." }, { status: 400 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Unavailable" }, { status: 503 });

  const assetResult = await service.from("video_producer_media_assets").select("id,project_id,role,revision,sync_status,sync_metadata").eq("id", parsed.data.asset_id).eq("project_id", parsed.data.project_id).maybeSingle();
  if (assetResult.error) return NextResponse.json({ error: assetResult.error.message }, { status: 500 });
  const asset = assetResult.data;
  if (!asset) return NextResponse.json({ error: "Asset not found." }, { status: 404 });
  const metadata = record(asset.sync_metadata);
  const bridge = record(metadata.syncBridge);
  const expectedHash = typeof bridge.callbackTokenHash === "string" ? bridge.callbackTokenHash : "";
  if (!expectedHash || !workerTokenMatches(parsed.data.token, expectedHash)) return NextResponse.json({ error: "Invalid callback token." }, { status: 403 });

  const now = new Date().toISOString();
  if (parsed.data.status === "syncing") {
    const update = await service.from("video_producer_media_assets").update({
      sync_metadata: {
        ...metadata,
        syncBridge: {
          ...bridge,
          progress: parsed.data.progress ?? bridge.progress ?? 0,
          stage: parsed.data.stage ?? bridge.stage ?? "Synchronizing",
          heartbeatAt: now
        }
      }
    }).eq("id", asset.id);
    if (update.error) return NextResponse.json({ error: update.error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (parsed.data.status === "failed") {
    const update = await service.from("video_producer_media_assets").update({
      sync_status: "failed",
      sync_metadata: {
        ...metadata,
        error: parsed.data.error || "Waveform synchronization failed.",
        failedAt: now,
        syncBridge: { ...bridge, callbackTokenHash: null, heartbeatAt: now, stage: parsed.data.stage || "Failed" }
      }
    }).eq("id", asset.id);
    if (update.error) return NextResponse.json({ error: update.error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (!parsed.data.result) return NextResponse.json({ error: "Completed synchronization requires a result." }, { status: 400 });
  const nextRevision = Math.max(1, Number(asset.revision || 1)) + 1;
  const updated = await service.from("video_producer_media_assets").update({
    duration: parsed.data.result.asset_duration,
    has_audio: parsed.data.result.has_audio,
    sync_status: parsed.data.result.status,
    sync_method: "waveform",
    offset_seconds: parsed.data.result.offset_seconds,
    sync_confidence: parsed.data.result.confidence,
    revision: nextRevision,
    sync_metadata: {
      ...metadata,
      method: parsed.data.result.method,
      result: parsed.data.result.metadata ?? {},
      completedAt: now,
      syncBridge: { ...bridge, callbackTokenHash: null, heartbeatAt: now, progress: 100, stage: parsed.data.stage || "Synchronized" }
    }
  }).eq("id", asset.id).select("*").single();
  if (updated.error) return NextResponse.json({ error: updated.error.message }, { status: 500 });

  const invalidated = await service.from("video_producer_projects").update({
    camera_plan: null,
    approval_fingerprint: null,
    approved_at: null
  }).or(`id.eq.${asset.project_id},parent_project_id.eq.${asset.project_id}`).is("deleted_at", null);
  if (invalidated.error) return NextResponse.json({ error: invalidated.error.message }, { status: 500 });
  return NextResponse.json({ ok: true, asset: updated.data });
}
