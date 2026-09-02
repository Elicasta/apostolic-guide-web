import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/supabase";
import { deletePrivateVideoProducerBlob, workerTokenMatches } from "@/video-producer-server";

export const runtime = "nodejs";

const schema = z.object({
  jobId: z.string().uuid(),
  status: z.enum(["downloading", "normalizing", "uploading", "completed", "failed"]),
  percent: z.number().min(0).max(100).optional(),
  stage: z.string().max(180).optional(),
  error: z.string().max(2000).optional(),
  output: z.object({
    storageLocator: z.string().min(1).max(1000), filename: z.string().min(1).max(255), mimeType: z.literal("video/mp4"),
    sizeBytes: z.number().nonnegative(), sha256: z.string().min(32).max(128), duration: z.number().positive(),
    width: z.number().int().positive(), height: z.number().int().positive(), fps: z.number().positive(),
    assetIn: z.number().nonnegative(), assetOut: z.number().positive()
  }).optional()
});

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function POST(request: Request) {
  const token = request.headers.get("x-video-producer-worker-token")?.trim() || "";
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !token) return NextResponse.json({ error: "Invalid callback." }, { status: 400 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Service unavailable." }, { status: 503 });

  const jobResult = await service.from("video_producer_visual_import_jobs").select("*").eq("id", parsed.data.jobId).maybeSingle();
  if (jobResult.error || !jobResult.data) return NextResponse.json({ error: "Import job not found." }, { status: 404 });
  const job = jobResult.data;
  const metadata = object(job.metadata);
  const expectedHash = typeof metadata.callbackTokenHash === "string" ? metadata.callbackTokenHash : "";
  if (!expectedHash || !workerTokenMatches(token, expectedHash)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const progress = { percent: parsed.data.percent ?? (["completed", "failed"].includes(parsed.data.status) ? 100 : 0), stage: parsed.data.stage ?? parsed.data.status, heartbeatAt: new Date().toISOString() };
  if (parsed.data.status !== "completed") {
    const updated = await service.from("video_producer_visual_import_jobs").update({
      status: parsed.data.status, progress, error: parsed.data.error ?? null,
      ...(parsed.data.status === "downloading" ? { started_at: new Date().toISOString() } : {}),
      ...(parsed.data.status === "failed" ? { completed_at: new Date().toISOString() } : {})
    }).eq("id", job.id);
    if (updated.error) return NextResponse.json({ error: updated.error.message }, { status: 500 });
    if (parsed.data.status === "failed" && job.generation_job_id) {
      await service.from("video_producer_visual_generation_jobs").update({ status: "failed", error: parsed.data.error ?? "Generated media import failed.", completed_at: new Date().toISOString() }).eq("id", job.generation_job_id);
    }
    return NextResponse.json({ ok: true });
  }

  const output = parsed.data.output;
  if (!output) return NextResponse.json({ error: "Completed import is missing output metadata." }, { status: 400 });

  try {
    let assetId = "";
    if (job.provider_asset_id) {
      const existing = await service.from("video_producer_visual_assets").select("id,storage_locator,duration")
        .eq("source_provider", job.provider).eq("provider_asset_id", job.provider_asset_id).eq("reusable", true).maybeSingle();
      if (existing.error) throw new Error(existing.error.message);
      if (existing.data) {
        assetId = existing.data.id;
        if (existing.data.storage_locator !== output.storageLocator) await deletePrivateVideoProducerBlob(output.storageLocator);
      }
    }

    if (!assetId) {
      const candidateMetadata = object(metadata.candidateMetadata);
      const generationMetadata = object(metadata.generationMetadata);
      const asset = await service.from("video_producer_visual_assets").insert({
        source_provider: job.provider, provider_asset_id: job.provider_asset_id, source_url: job.source_url, creator: job.creator,
        license_name: job.license_name, license_url: job.license_url, license_snapshot: job.license_snapshot,
        retrieved_at: new Date().toISOString(), storage_provider: "vercel_blob", storage_locator: output.storageLocator,
        filename: output.filename, mime_type: output.mimeType, size_bytes: output.sizeBytes, sha256: output.sha256,
        duration: output.duration, width: output.width, height: output.height, fps: output.fps,
        tags: typeof candidateMetadata.tags === "string" ? candidateMetadata.tags.split(",").map((value) => value.trim()).filter(Boolean).slice(0, 24) : [],
        description: job.title || null,
        generation_prompt: job.generation_job_id && typeof generationMetadata.prompt === "string" ? generationMetadata.prompt : null,
        generation_model: job.generation_job_id && typeof generationMetadata.model === "string" ? generationMetadata.model : null,
        reusable: Boolean(job.reusable),
        rights_flags: job.provider === "pexels" || job.provider === "pixabay" ? { thirdPartyRightsReviewRequired: true } : {},
        metadata: { importedFromJobId: job.id, originalProviderMetadata: candidateMetadata, providerSourceAssetIn: output.assetIn, providerSourceAssetOut: output.assetOut },
        revision: 1, created_by: job.created_by, updated_by: job.created_by
      }).select("id,duration").single();
      if (asset.error) throw new Error(asset.error.message);
      assetId = asset.data.id;
    }

    const selectedAsset = await service.from("video_producer_visual_assets").select("duration").eq("id", assetId).maybeSingle();
    if (selectedAsset.error) throw new Error(selectedAsset.error.message);
    const durableDuration = Math.max(0.5, Number(selectedAsset.data?.duration || output.duration));
    const sourceStart = Math.max(0, Number(metadata.sourceStart || 0));
    const requestedSourceEnd = Math.max(sourceStart + 0.1, Number(metadata.sourceEnd || sourceStart + durableDuration));
    const sourceEnd = Math.min(requestedSourceEnd, sourceStart + durableDuration);

    const disabled = await service.from("video_producer_visual_placements").update({ active: false, updated_by: job.created_by }).eq("beat_id", job.beat_id).eq("active", true);
    if (disabled.error) throw new Error(disabled.error.message);
    const placement = await service.from("video_producer_visual_placements").insert({
      project_id: job.project_id, beat_id: job.beat_id, asset_id: assetId,
      source_start: sourceStart, source_end: sourceEnd,
      asset_in: 0, asset_out: Math.min(durableDuration, sourceEnd - sourceStart),
      fit: "cover", position_x: 0.5, position_y: 0.5, scale: 1, layer: 2, audio_enabled: false,
      source: "auto", locked: false, revision: 1, active: true, created_by: job.created_by, updated_by: job.created_by
    }).select("id").single();
    if (placement.error) throw new Error(placement.error.message);

    const beat = await service.from("video_producer_visual_beats").update({ status: "resolved", updated_by: job.created_by }).eq("id", job.beat_id);
    if (beat.error) throw new Error(beat.error.message);
    const projectResult = await service.from("video_producer_projects").select("status").eq("id", job.project_id).maybeSingle();
    if (projectResult.error) throw new Error(projectResult.error.message);
    const projectUpdate = await service.from("video_producer_projects").update({
      approval_fingerprint: null, approved_at: null,
      ...(projectResult.data?.status === "approved" ? { status: "planned" } : {}), updated_by: job.created_by
    }).eq("id", job.project_id);
    if (projectUpdate.error) throw new Error(projectUpdate.error.message);

    const finished = await service.from("video_producer_visual_import_jobs").update({
      status: "completed", progress, asset_id: assetId, placement_id: placement.data.id, error: null, completed_at: new Date().toISOString()
    }).eq("id", job.id);
    if (finished.error) throw new Error(finished.error.message);
    if (job.generation_job_id) {
      const generation = await service.from("video_producer_visual_generation_jobs").update({ status: "completed", asset_id: assetId, error: null, completed_at: new Date().toISOString() }).eq("id", job.generation_job_id);
      if (generation.error) throw new Error(generation.error.message);
    }
    return NextResponse.json({ ok: true, assetId, placementId: placement.data.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Visual import callback failed.";
    await service.from("video_producer_visual_import_jobs").update({ status: "failed", progress, error: message, completed_at: new Date().toISOString() }).eq("id", job.id);
    if (job.generation_job_id) await service.from("video_producer_visual_generation_jobs").update({ status: "failed", error: message, completed_at: new Date().toISOString() }).eq("id", job.generation_job_id);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
