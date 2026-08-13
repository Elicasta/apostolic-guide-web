import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/supabase";

export const runtime = "nodejs";

const schema = z.object({
  clip_id: z.string().uuid(),
  token: z.string().min(32).max(256),
  status: z.enum(["rendering", "completed", "failed"]),
  error: z.string().max(2000).optional(),
  progress: z.number().int().min(0).max(100).optional(),
  stage: z.string().max(120).optional()
});

function tokenMatches(raw: string, expected: string) {
  const actual = createHash("sha256").update(raw).digest();
  const wanted = Buffer.from(expected, "hex");
  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
}

function record(value: unknown) {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function progressMetadata(metadata: Record<string, unknown>, progress: number, stage: string, now: string) {
  return {
    ...metadata,
    renderProgress: {
      progress,
      stage,
      updatedAt: now
    }
  };
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid social clip renderer callback." }, { status: 400 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Renderer callback is unavailable." }, { status: 503 });

  const clipResult = await service.from("pathway_social_clips")
    .select("id,asset_id,storage_path,callback_token_hash,analysis_metadata")
    .eq("id", parsed.data.clip_id)
    .maybeSingle();
  if (clipResult.error) return NextResponse.json({ error: clipResult.error.message }, { status: 500 });
  const clip = clipResult.data;
  if (!clip) return NextResponse.json({ error: "Social clip job not found." }, { status: 404 });
  if (!clip.callback_token_hash || !tokenMatches(parsed.data.token, clip.callback_token_hash)) {
    return NextResponse.json({ error: "Invalid renderer token." }, { status: 403 });
  }

  const now = new Date().toISOString();
  const metadata = record(clip.analysis_metadata);

  if (parsed.data.status === "rendering") {
    const progress = parsed.data.progress ?? 5;
    const stage = parsed.data.stage?.trim() || "Rendering";
    const updated = await service.from("pathway_social_clips").update({
      status: "rendering",
      error: null,
      analysis_metadata: progressMetadata(metadata, progress, stage, now),
      updated_at: now
    }).eq("id", clip.id);
    if (updated.error) return NextResponse.json({ error: updated.error.message }, { status: 500 });
    return NextResponse.json({ ok: true, progress, stage });
  }

  if (parsed.data.status === "failed") {
    const error = parsed.data.error?.trim() || "Social clip renderer failed without an error message.";
    const failedMetadata = progressMetadata(metadata, parsed.data.progress ?? 100, parsed.data.stage?.trim() || "Failed", now);
    const updates = [service.from("pathway_social_clips").update({
      status: "failed",
      error,
      analysis_metadata: failedMetadata,
      updated_at: now
    }).eq("id", clip.id)];
    if (clip.asset_id) updates.push(service.from("pathway_assets").update({ status: "blocked", notes: `Social clip render failed: ${error.slice(0, 1500)}`, updated_at: now }).eq("id", clip.asset_id));
    const results = await Promise.all(updates);
    const failed = results.find((result) => result.error);
    if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const bridge = record(metadata.renderBridge);
  const socialPackage = record(metadata.socialPackage);
  const publicUrl = typeof bridge.publicUrl === "string" ? bridge.publicUrl : "";
  const coverPublicUrl = typeof bridge.coverPublicUrl === "string" ? bridge.coverPublicUrl : "";
  if (!clip.storage_path || !publicUrl) return NextResponse.json({ error: "Social clip output metadata is missing." }, { status: 409 });

  const completedMetadata = {
    ...progressMetadata(metadata, 100, parsed.data.stage?.trim() || "Ready", now),
    socialPackage: {
      ...socialPackage,
      coverUrl: coverPublicUrl || (typeof socialPackage.coverUrl === "string" ? socialPackage.coverUrl : null)
    },
    renderedAt: now
  };

  const updates = [service.from("pathway_social_clips").update({
    status: "completed",
    output_url: publicUrl,
    analysis_metadata: completedMetadata,
    error: null,
    completed_at: now,
    updated_at: now
  }).eq("id", clip.id)];
  if (clip.asset_id) updates.push(service.from("pathway_assets").update({ status: "ready_to_publish", file_url: publicUrl, updated_at: now }).eq("id", clip.asset_id));
  const results = await Promise.all(updates);
  const failed = results.find((result) => result.error);
  if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 500 });

  return NextResponse.json({ ok: true, output_url: publicUrl, cover_url: coverPublicUrl || null });
}
