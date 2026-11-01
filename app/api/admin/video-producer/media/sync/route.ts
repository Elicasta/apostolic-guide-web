import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";
import {
  createPrivateBlobDownloadUrl,
  createWorkerCallbackToken,
  dispatchVideoProducerWorker,
  videoProducerRendererCredentials,
  videoProducerWorkerRef
} from "@/video-producer-server";

export const runtime = "nodejs";

const schema = z.object({ projectId: z.string().uuid(), assetId: z.string().uuid() });
const CALLBACK_ORIGIN = "https://apostolic-guide-web.vercel.app";

function callbackOrigin(request: Request) {
  const configured = process.env.VIDEO_PRODUCER_CALLBACK_ORIGIN?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  return process.env.VERCEL_ENV === "preview" ? CALLBACK_ORIGIN : new URL(request.url).origin;
}

export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid synchronization request." }, { status: 400 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });

  const requestedProject = await service.from("video_producer_projects").select("id,parent_project_id,source_provider,source_locator").eq("id", parsed.data.projectId).is("deleted_at", null).maybeSingle();
  if (requestedProject.error) return NextResponse.json({ error: requestedProject.error.message }, { status: 500 });
  if (!requestedProject.data) return NextResponse.json({ error: "Video Producer project not found." }, { status: 404 });
  const rootId = requestedProject.data.parent_project_id || requestedProject.data.id;
  const root = rootId === requestedProject.data.id
    ? requestedProject
    : await service.from("video_producer_projects").select("id,source_provider,source_locator").eq("id", rootId).is("deleted_at", null).maybeSingle();
  if (root.error) return NextResponse.json({ error: root.error.message }, { status: 500 });
  if (!root.data?.source_locator || root.data.source_provider !== "vercel_blob") return NextResponse.json({ error: "Camera A source is not available for waveform synchronization." }, { status: 409 });

  const assetResult = await service.from("video_producer_media_assets").select("*").eq("id", parsed.data.assetId).eq("project_id", rootId).eq("active", true).maybeSingle();
  if (assetResult.error) return NextResponse.json({ error: assetResult.error.message }, { status: 500 });
  const asset = assetResult.data;
  if (!asset?.storage_locator || asset.storage_provider !== "vercel_blob") return NextResponse.json({ error: "Optional media asset is unavailable." }, { status: 404 });

  try {
    const callback = createWorkerCallbackToken();
    const workerRef = videoProducerWorkerRef();
    const origin = callbackOrigin(request);
    const [cameraAUrl, assetUrl, credentials] = await Promise.all([
      createPrivateBlobDownloadUrl(root.data.source_locator, 4 * 60 * 60 * 1000),
      createPrivateBlobDownloadUrl(asset.storage_locator, 4 * 60 * 60 * 1000),
      videoProducerRendererCredentials(service)
    ]);
    if (!credentials.token) return NextResponse.json({ error: "Video worker is not connected." }, { status: 503 });

    const metadata = asset.sync_metadata && typeof asset.sync_metadata === "object" ? asset.sync_metadata as Record<string, unknown> : {};
    const updated = await service.from("video_producer_media_assets").update({
      sync_status: "syncing",
      sync_method: null,
      sync_confidence: null,
      sync_metadata: {
        ...metadata,
        syncBridge: {
          callbackTokenHash: callback.hash,
          dispatchedAt: new Date().toISOString(),
          workerRef,
          progress: 0,
          stage: "Queued"
        }
      },
      updated_by: access.user.id
    }).eq("id", asset.id).select("*").single();
    if (updated.error) throw new Error(updated.error.message);

    await dispatchVideoProducerWorker({
      token: credentials.token,
      repository: credentials.repository,
      eventType: "video-producer-sync",
      payload: {
        project_id: rootId,
        asset_id: asset.id,
        worker_ref: workerRef,
        camera_a_url: cameraAUrl,
        asset_url: assetUrl,
        callback_url: `${origin}/api/admin/video-producer/sync-callback`,
        callback_token: callback.token
      }
    });
    return NextResponse.json({ asset: updated.data, workerRef });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Waveform synchronization could not start.";
    await service.from("video_producer_media_assets").update({ sync_status: "failed", sync_metadata: { error: message, failedAt: new Date().toISOString() }, updated_by: access.user.id }).eq("id", asset.id);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
