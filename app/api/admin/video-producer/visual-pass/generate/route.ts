import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";
import {
  createPrivateBlobDownloadUrl,
  createPrivateBlobUploadUrl,
  createWorkerCallbackToken,
  dispatchVideoProducerWorker,
  videoProducerRendererCredentials,
  videoProducerWorkerRef
} from "@/video-producer-server";
import { createRunwayVisualTask, getRunwayVisualTask } from "@/video-producer-visual-providers";
import type { VideoProducerVisualBeat } from "@/video-producer-visuals";

export const runtime = "nodejs";
export const maxDuration = 60;

const postSchema = z.object({ beatId: z.string().uuid(), sourceImageAssetId: z.string().uuid().nullable().optional() });
const getSchema = z.object({ jobId: z.string().uuid() });
const MAX_VISUAL_BYTES = 2 * 1024 * 1024 * 1024;
const DEFAULT_PUBLIC_CALLBACK_ORIGIN = "https://www.apostolicguide.com";

function callbackOrigin(request: Request) {
  const configured = process.env.VIDEO_PRODUCER_CALLBACK_ORIGIN?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  const requestOrigin = new URL(request.url).origin;
  return process.env.VERCEL_ENV === "preview" ? DEFAULT_PUBLIC_CALLBACK_ORIGIN : requestOrigin;
}

function toBeat(row: Record<string, unknown>): VideoProducerVisualBeat {
  return {
    id: String(row.id), projectId: String(row.project_id), sourceStart: Number(row.source_start), duration: Number(row.duration),
    dialogue: String(row.dialogue ?? ""), recommendation: String(row.recommendation) as VideoProducerVisualBeat["recommendation"],
    intent: String(row.intent ?? ""), searchQueries: Array.isArray(row.search_queries) ? row.search_queries.filter((value): value is string => typeof value === "string") : [],
    vocabulary: String(row.vocabulary) as VideoProducerVisualBeat["vocabulary"], preferredStyle: typeof row.preferred_style === "string" ? row.preferred_style : undefined,
    avoid: Array.isArray(row.avoid) ? row.avoid.filter((value): value is string => typeof value === "string") : [], status: String(row.status) as VideoProducerVisualBeat["status"],
    source: String(row.source) as VideoProducerVisualBeat["source"], revision: Number(row.revision || 1)
  };
}

function provisionalRange(beat: { source_start: number; duration: number }, sourceDuration: number) {
  const start = Math.max(0, Number(beat.source_start) - 0.35);
  const desired = Math.min(8, Math.max(1.5, Number(beat.duration)));
  return { start, end: Math.min(sourceDuration, start + desired), duration: Math.min(desired, Math.max(0.5, sourceDuration - start)) };
}

function uniqueTags(values: unknown[]) {
  return [...new Set(values.flatMap((value) => {
    if (typeof value === "string") return value.split(/[;,]/).map((part) => part.replace(/\s+/g, " ").trim()).filter(Boolean);
    if (Array.isArray(value)) return value.filter((part): part is string => typeof part === "string").map((part) => part.replace(/\s+/g, " ").trim()).filter(Boolean);
    return [];
  }))].slice(0, 24);
}

async function dispatchGeneratedImport(input: {
  request: Request;
  service: NonNullable<ReturnType<typeof createServiceClient>>;
  generationJob: Record<string, unknown>;
  downloadUrl: string;
  userId: string;
}) {
  const generationJobId = String(input.generationJob.id);
  const projectId = String(input.generationJob.project_id);
  const beatId = String(input.generationJob.beat_id);
  const existing = await input.service.from("video_producer_visual_import_jobs")
    .select("id,status,progress,asset_id,placement_id")
    .eq("generation_job_id", generationJobId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data) return existing.data;

  const [beatResult, projectResult] = await Promise.all([
    input.service.from("video_producer_visual_beats").select("source_start,duration,vocabulary,search_queries,intent").eq("id", beatId).maybeSingle(),
    input.service.from("video_producer_projects").select("source_duration").eq("id", projectId).maybeSingle()
  ]);
  if (beatResult.error) throw new Error(beatResult.error.message);
  if (projectResult.error) throw new Error(projectResult.error.message);
  if (!beatResult.data || !projectResult.data?.source_duration) throw new Error("Generation project timing is unavailable.");
  const range = provisionalRange(beatResult.data, Number(projectResult.data.source_duration));

  const { token, repository } = await videoProducerRendererCredentials(input.service);
  if (!token) throw new Error("Video media worker is not connected.");
  const importJobId = randomUUID();
  const outputPath = `video-producer/visuals/${projectId}/${importJobId}.mp4`;
  const uploadUrl = await createPrivateBlobUploadUrl({ pathname: outputPath, contentType: "video/mp4", maxBytes: MAX_VISUAL_BYTES, ttlMs: 3 * 60 * 60 * 1000 });
  const callback = createWorkerCallbackToken();
  const providerJobMetadata = input.generationJob.metadata && typeof input.generationJob.metadata === "object"
    ? input.generationJob.metadata as Record<string, unknown>
    : {};
  const providerTaskId = String(input.generationJob.provider_task_id || generationJobId);
  const generationProvenance = {
    provider: "runway",
    providerTaskId,
    model: typeof input.generationJob.model === "string" ? input.generationJob.model : null,
    prompt: typeof input.generationJob.prompt === "string" ? input.generationJob.prompt : null,
    generationMode: typeof input.generationJob.generation_mode === "string" ? input.generationJob.generation_mode : null,
    sourceImageAssetId: typeof input.generationJob.source_image_asset_id === "string" ? input.generationJob.source_image_asset_id : null,
    createdAt: typeof input.generationJob.created_at === "string" ? input.generationJob.created_at : null,
    providerJobMetadata,
    tags: uniqueTags(["ai-generated", beatResult.data.vocabulary, beatResult.data.search_queries])
  };
  const created = await input.service.from("video_producer_visual_import_jobs").insert({
    id: importJobId,
    project_id: projectId,
    beat_id: beatId,
    generation_job_id: generationJobId,
    provider: "runway",
    provider_asset_id: providerTaskId,
    source_url: null,
    download_url: input.downloadUrl,
    creator: "Apostolic Guide / Runway",
    license_name: "AI generated for Apostolic Guide",
    license_url: "https://runwayml.com/",
    license_snapshot: JSON.stringify({
      provider: "runway",
      providerTaskId,
      generatedAt: new Date().toISOString(),
      model: generationProvenance.model,
      generationMode: generationProvenance.generationMode,
      prompt: generationProvenance.prompt
    }),
    title: `Runway visual ${providerTaskId.slice(0, 12)}`,
    desired_duration: range.duration,
    requested_asset_in: 0,
    reusable: true,
    status: "queued",
    progress: { percent: 0, stage: "Queued" },
    metadata: {
      callbackTokenHash: callback.hash,
      outputPath,
      sourceStart: range.start,
      sourceEnd: range.end,
      generationJobId,
      generationMetadata: generationProvenance,
      beatIntent: beatResult.data.intent,
      rightsReviewRequired: false
    },
    created_by: input.userId
  }).select("id,status,progress").single();
  if (created.error) throw new Error(created.error.message);

  await dispatchVideoProducerWorker({
    token, repository, eventType: "video-producer-visual-import",
    payload: {
      job_id: importJobId,
      project_id: projectId,
      beat_id: beatId,
      worker_ref: videoProducerWorkerRef(),
      provider: "runway",
      provider_asset_id: providerTaskId,
      download_url: input.downloadUrl,
      output_upload_url: uploadUrl,
      output_path: outputPath,
      callback_url: `${callbackOrigin(input.request)}/api/admin/video-producer/visual-pass/import-callback`,
      callback_token: callback.token,
      desired_duration: range.duration,
      asset_in: 0
    }
  });
  return created.data;
}

export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid generation request." }, { status: 400 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });

  const beatResult = await service.from("video_producer_visual_beats").select("*").eq("id", parsed.data.beatId).maybeSingle();
  if (beatResult.error) return NextResponse.json({ error: beatResult.error.message }, { status: 500 });
  if (!beatResult.data) return NextResponse.json({ error: "Visual beat not found." }, { status: 404 });
  const projectResult = await service.from("video_producer_projects").select("id,mode,status").eq("id", beatResult.data.project_id).is("deleted_at", null).maybeSingle();
  if (projectResult.error) return NextResponse.json({ error: projectResult.error.message }, { status: 500 });
  if (!projectResult.data || (projectResult.data.mode !== "podcast" && projectResult.data.mode !== "reels")) return NextResponse.json({ error: "Video Producer project not found." }, { status: 404 });
  if (projectResult.data.status === "rendering") return NextResponse.json({ error: "Wait for the current render before generating visuals." }, { status: 409 });

  let promptImage: string | null = null;
  if (parsed.data.sourceImageAssetId) {
    const image = await service.from("video_producer_visual_assets").select("id,mime_type,storage_locator").eq("id", parsed.data.sourceImageAssetId).maybeSingle();
    if (image.error) return NextResponse.json({ error: image.error.message }, { status: 500 });
    if (!image.data?.mime_type?.startsWith("image/")) return NextResponse.json({ error: "Image-to-video requires an image asset." }, { status: 409 });
    promptImage = await createPrivateBlobDownloadUrl(image.data.storage_locator, 60 * 60 * 1000);
  }

  try {
    const task = await createRunwayVisualTask({ beat: toBeat(beatResult.data as Record<string, unknown>), mode: projectResult.data.mode, promptImage });
    const job = await service.from("video_producer_visual_generation_jobs").insert({
      project_id: projectResult.data.id,
      beat_id: beatResult.data.id,
      provider: "runway",
      model: task.model,
      generation_mode: promptImage ? "image-to-video" : "text-to-video",
      prompt: task.promptText,
      source_image_asset_id: parsed.data.sourceImageAssetId ?? null,
      provider_task_id: task.id,
      status: "generating",
      metadata: { providerTask: task.raw, outputMustBePersisted: true, assemblyAuthority: true, finalCutAuthority: false },
      created_by: access.user.id,
      started_at: new Date().toISOString()
    }).select("id,provider,model,generation_mode,status,created_at").single();
    if (job.error) throw new Error(job.error.message);
    return NextResponse.json({ generationJob: job.data, prompt: task.promptText });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Visual generation could not start." }, { status: 502 });
  }
}

export async function GET(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = getSchema.safeParse({ jobId: new URL(request.url).searchParams.get("jobId") });
  if (!parsed.success) return NextResponse.json({ error: "jobId is required." }, { status: 400 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });
  const jobResult = await service.from("video_producer_visual_generation_jobs").select("*").eq("id", parsed.data.jobId).maybeSingle();
  if (jobResult.error) return NextResponse.json({ error: jobResult.error.message }, { status: 500 });
  const job = jobResult.data;
  if (!job) return NextResponse.json({ error: "Generation job not found." }, { status: 404 });
  if (["completed", "failed", "cancelled", "importing"].includes(job.status)) {
    const imports = await service.from("video_producer_visual_import_jobs").select("id,status,progress,asset_id,placement_id,error").eq("generation_job_id", job.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    return NextResponse.json({ generationJob: job, importJob: imports.data ?? null });
  }
  if (job.provider !== "runway" || !job.provider_task_id) return NextResponse.json({ generationJob: job });

  try {
    const task = await getRunwayVisualTask(job.provider_task_id);
    const providerStatus = String(task.status || "").toUpperCase();
    if (["FAILED", "CANCELED", "CANCELLED", "THROTTLED"].includes(providerStatus)) {
      const failed = await service.from("video_producer_visual_generation_jobs").update({ status: "failed", error: task.failure || `Runway task ${providerStatus.toLowerCase()}.`, completed_at: new Date().toISOString(), metadata: { ...(job.metadata ?? {}), providerTask: task.raw } }).eq("id", job.id).select("*").single();
      if (failed.error) throw new Error(failed.error.message);
      return NextResponse.json({ generationJob: failed.data });
    }
    if (providerStatus !== "SUCCEEDED") {
      const updated = await service.from("video_producer_visual_generation_jobs").update({ status: "generating", metadata: { ...(job.metadata ?? {}), providerTask: task.raw, checkedAt: new Date().toISOString() } }).eq("id", job.id).select("*").single();
      if (updated.error) throw new Error(updated.error.message);
      return NextResponse.json({ generationJob: updated.data });
    }
    const outputUrl = task.output?.[0];
    if (!outputUrl) throw new Error("Runway completed without an output URL.");
    const updated = await service.from("video_producer_visual_generation_jobs").update({
      status: "succeeded",
      ephemeral_output_url: outputUrl,
      output_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      metadata: { ...(job.metadata ?? {}), providerTask: task.raw, ephemeralOutputMustNotBeExposed: true }
    }).eq("id", job.id).select("*").single();
    if (updated.error) throw new Error(updated.error.message);
    const importJob = await dispatchGeneratedImport({ request, service, generationJob: updated.data, downloadUrl: outputUrl, userId: access.user.id });
    const importing = await service.from("video_producer_visual_generation_jobs").update({ status: "importing" }).eq("id", job.id).select("*").single();
    if (importing.error) throw new Error(importing.error.message);
    return NextResponse.json({ generationJob: importing.data, importJob });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Generation status could not be refreshed." }, { status: 502 });
  }
}
