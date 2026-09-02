import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";
import {
  createPrivateBlobUploadUrl,
  createWorkerCallbackToken,
  dispatchVideoProducerWorker,
  videoProducerRendererCredentials,
  videoProducerWorkerRef
} from "@/video-producer-server";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({ candidateId: z.string().uuid() });
const MAX_VISUAL_BYTES = 2 * 1024 * 1024 * 1024;
const DEFAULT_PUBLIC_CALLBACK_ORIGIN = "https://apostolic-guide-web.vercel.app";

function callbackOrigin(request: Request) {
  const configured = process.env.VIDEO_PRODUCER_CALLBACK_ORIGIN?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  const requestOrigin = new URL(request.url).origin;
  return process.env.VERCEL_ENV === "preview" ? DEFAULT_PUBLIC_CALLBACK_ORIGIN : requestOrigin;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function provisionalRange(beat: { source_start: number; duration: number }, sourceDuration: number) {
  const start = Math.max(0, Number(beat.source_start) - 0.35);
  const desired = Math.min(8, Math.max(1.5, Number(beat.duration)));
  const end = Math.min(sourceDuration, start + desired);
  return { start, end, duration: Math.max(0.5, end - start) };
}

async function invalidateApproval(service: NonNullable<ReturnType<typeof createServiceClient>>, projectId: string, userId: string) {
  const current = await service.from("video_producer_projects").select("status").eq("id", projectId).maybeSingle();
  if (current.error) throw new Error(current.error.message);
  const status = current.data?.status === "approved" ? "planned" : current.data?.status;
  const update = await service.from("video_producer_projects").update({
    approval_fingerprint: null,
    approved_at: null,
    ...(status ? { status } : {}),
    updated_by: userId
  }).eq("id", projectId);
  if (update.error) throw new Error(update.error.message);
}

async function placeExistingAsset(input: {
  service: NonNullable<ReturnType<typeof createServiceClient>>;
  projectId: string;
  beatId: string;
  assetId: string;
  sourceStart: number;
  sourceEnd: number;
  assetIn: number;
  assetOut: number;
  userId: string;
}) {
  const disabled = await input.service.from("video_producer_visual_placements").update({ active: false, updated_by: input.userId })
    .eq("beat_id", input.beatId).eq("active", true);
  if (disabled.error) throw new Error(disabled.error.message);
  const placement = await input.service.from("video_producer_visual_placements").insert({
    project_id: input.projectId,
    beat_id: input.beatId,
    asset_id: input.assetId,
    source_start: input.sourceStart,
    source_end: input.sourceEnd,
    asset_in: input.assetIn,
    asset_out: input.assetOut,
    fit: "cover",
    position_x: 0.5,
    position_y: 0.5,
    scale: 1,
    layer: 2,
    audio_enabled: false,
    source: "auto",
    locked: false,
    revision: 1,
    active: true,
    created_by: input.userId,
    updated_by: input.userId
  }).select("*,asset:video_producer_visual_assets(*)").single();
  if (placement.error) throw new Error(placement.error.message);
  const beat = await input.service.from("video_producer_visual_beats").update({ status: "resolved", updated_by: input.userId }).eq("id", input.beatId);
  if (beat.error) throw new Error(beat.error.message);
  await invalidateApproval(input.service, input.projectId, input.userId);
  return placement.data;
}

export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid Visual Pass selection." }, { status: 400 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });

  const candidateResult = await service.from("video_producer_visual_candidates").select("*").eq("id", parsed.data.candidateId).maybeSingle();
  if (candidateResult.error) return NextResponse.json({ error: candidateResult.error.message }, { status: 500 });
  const candidate = candidateResult.data;
  if (!candidate) return NextResponse.json({ error: "Search candidate expired or no longer exists. Search again." }, { status: 404 });
  if (candidate.expires_at && new Date(candidate.expires_at).getTime() < Date.now()) return NextResponse.json({ error: "Search candidate expired. Search again before using it." }, { status: 410 });

  const beatResult = await service.from("video_producer_visual_beats").select("*").eq("id", candidate.beat_id).maybeSingle();
  if (beatResult.error) return NextResponse.json({ error: beatResult.error.message }, { status: 500 });
  const beat = beatResult.data;
  if (!beat) return NextResponse.json({ error: "Visual beat not found." }, { status: 404 });
  const projectResult = await service.from("video_producer_projects")
    .select("id,mode,status,source_duration,edit_plan")
    .eq("id", beat.project_id).is("deleted_at", null).maybeSingle();
  if (projectResult.error) return NextResponse.json({ error: projectResult.error.message }, { status: 500 });
  const project = projectResult.data;
  if (!project?.edit_plan || !project.source_duration) return NextResponse.json({ error: "Project source and edit plan are required." }, { status: 409 });
  if (project.status === "rendering") return NextResponse.json({ error: "Wait for the current render before changing visuals." }, { status: 409 });

  const metadata = object(candidate.metadata);
  const range = provisionalRange(beat, Number(project.source_duration));

  try {
    if (candidate.provider === "ag-library") {
      let assetId = typeof metadata.storedAssetId === "string" ? metadata.storedAssetId : "";
      if (!assetId && typeof metadata.pathwayAssetId === "string" && typeof metadata.storagePath === "string") {
        const providerAssetId = metadata.pathwayAssetId;
        const existing = await service.from("video_producer_visual_assets")
          .select("id,duration")
          .eq("source_provider", "ag-library").eq("provider_asset_id", providerAssetId).maybeSingle();
        if (existing.error) throw new Error(existing.error.message);
        if (existing.data) assetId = existing.data.id;
        else {
          const created = await service.from("video_producer_visual_assets").insert({
            source_provider: "ag-library",
            provider_asset_id: providerAssetId,
            source_url: candidate.source_url,
            creator: "Apostolic Guide",
            license_name: "Apostolic Guide owned media",
            retrieved_at: new Date().toISOString(),
            storage_provider: "vercel_blob",
            storage_locator: metadata.storagePath,
            filename: candidate.title || `ag-library-${providerAssetId}.mp4`,
            mime_type: typeof metadata.mimeType === "string" ? metadata.mimeType : "video/mp4",
            size_bytes: typeof metadata.sizeBytes === "number" ? metadata.sizeBytes : 0,
            duration: candidate.duration,
            width: candidate.width,
            height: candidate.height,
            tags: Array.isArray(metadata.tags) ? metadata.tags : [],
            description: typeof metadata.description === "string" ? metadata.description : candidate.title,
            reusable: true,
            rights_flags: {},
            metadata: { pathwayAssetId: providerAssetId },
            revision: 1,
            created_by: access.user.id,
            updated_by: access.user.id
          }).select("id,duration").single();
          if (created.error) throw new Error(created.error.message);
          assetId = created.data.id;
        }
      }
      if (!assetId) return NextResponse.json({ error: "This library result is not backed by durable AG media yet." }, { status: 409 });
      const asset = await service.from("video_producer_visual_assets").select("id,duration").eq("id", assetId).maybeSingle();
      if (asset.error) throw new Error(asset.error.message);
      if (!asset.data) return NextResponse.json({ error: "Library asset is unavailable." }, { status: 409 });
      const assetDuration = Number(asset.data.duration || range.duration);
      const assetIn = assetDuration > range.duration + 2 ? Math.min(2, assetDuration * 0.1) : 0;
      const assetOut = Math.min(assetDuration, assetIn + range.duration);
      const placement = await placeExistingAsset({
        service, projectId: project.id, beatId: beat.id, assetId,
        sourceStart: range.start, sourceEnd: range.start + Math.max(0.5, assetOut - assetIn),
        assetIn, assetOut, userId: access.user.id
      });
      return NextResponse.json({ placement, imported: false, assemblyAuthority: true });
    }

    if (!candidate.download_url || !["pexels", "pixabay"].includes(candidate.provider)) {
      return NextResponse.json({ error: "This result must be generated or re-searched before it can be used." }, { status: 409 });
    }

    let token = "";
    let repository = "";
    ({ token, repository } = await videoProducerRendererCredentials(service));
    if (!token) return NextResponse.json({ error: "Video media worker is not connected." }, { status: 503 });

    const jobId = randomUUID();
    const outputPath = `video-producer/visuals/${project.id}/${jobId}.mp4`;
    const uploadUrl = await createPrivateBlobUploadUrl({ pathname: outputPath, contentType: "video/mp4", maxBytes: MAX_VISUAL_BYTES, ttlMs: 3 * 60 * 60 * 1000 });
    const callback = createWorkerCallbackToken();
    const licenseSnapshot = JSON.stringify({
      provider: candidate.provider,
      licenseName: candidate.license_name,
      licenseUrl: candidate.license_url,
      sourceUrl: candidate.source_url,
      capturedAt: new Date().toISOString(),
      note: "Provider/source/license metadata captured when this clip was selected for an Apostolic Guide production."
    });
    const assetIn = Number(candidate.duration || 0) > range.duration + 2 ? Math.min(2, Number(candidate.duration) * 0.1) : 0;
    const job = await service.from("video_producer_visual_import_jobs").insert({
      id: jobId,
      project_id: project.id,
      beat_id: beat.id,
      provider: candidate.provider,
      provider_asset_id: candidate.provider_asset_id,
      source_url: candidate.source_url,
      download_url: candidate.download_url,
      creator: candidate.creator,
      license_name: candidate.license_name,
      license_url: candidate.license_url,
      license_snapshot: licenseSnapshot,
      title: candidate.title,
      desired_duration: range.duration,
      requested_asset_in: assetIn,
      reusable: true,
      status: "queued",
      progress: { percent: 0, stage: "Queued" },
      metadata: {
        callbackTokenHash: callback.hash,
        outputPath,
        sourceStart: range.start,
        sourceEnd: range.end,
        candidateMetadata: metadata,
        rightsReviewRequired: true
      },
      created_by: access.user.id
    }).select("id,status,progress").single();
    if (job.error) throw new Error(job.error.message);

    await dispatchVideoProducerWorker({
      token,
      repository,
      eventType: "video-producer-visual-import",
      payload: {
        job_id: jobId,
        project_id: project.id,
        beat_id: beat.id,
        worker_ref: videoProducerWorkerRef(),
        provider: candidate.provider,
        provider_asset_id: candidate.provider_asset_id,
        download_url: candidate.download_url,
        output_upload_url: uploadUrl,
        output_path: outputPath,
        callback_url: `${callbackOrigin(request)}/api/admin/video-producer/visual-pass/import-callback`,
        callback_token: callback.token,
        desired_duration: range.duration,
        asset_in: assetIn
      }
    });
    return NextResponse.json({ importJob: job.data, imported: true, assemblyAuthority: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Visual selection could not be applied." }, { status: 502 });
  }
}
