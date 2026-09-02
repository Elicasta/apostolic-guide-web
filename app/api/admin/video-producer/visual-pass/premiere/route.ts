import { NextResponse } from "next/server";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";
import { createPrivateBlobDownloadUrl } from "@/video-producer-server";
import { buildVideoProducerLicenseManifest, buildVideoProducerPremiereAssembly, type VideoProducerVisualAsset, type VideoProducerVisualPlacement } from "@/video-producer-visuals";

export const runtime = "nodejs";

function placement(row: Record<string, unknown>): VideoProducerVisualPlacement {
  return {
    id: String(row.id), projectId: String(row.project_id), beatId: String(row.beat_id), assetId: String(row.asset_id),
    sourceStart: Number(row.source_start), sourceEnd: Number(row.source_end), assetIn: Number(row.asset_in), assetOut: Number(row.asset_out),
    fit: row.fit === "contain" ? "contain" : "cover", positionX: Number(row.position_x ?? 0.5), positionY: Number(row.position_y ?? 0.5),
    scale: Number(row.scale ?? 1), layer: Number(row.layer ?? 2), audioEnabled: false,
    source: row.source === "manual" ? "manual" : "auto", locked: Boolean(row.locked), revision: Number(row.revision || 1)
  };
}

function asset(row: Record<string, unknown>): VideoProducerVisualAsset {
  return {
    id: String(row.id), sourceProvider: String(row.source_provider) as VideoProducerVisualAsset["sourceProvider"],
    providerAssetId: typeof row.provider_asset_id === "string" ? row.provider_asset_id : null,
    sourceUrl: typeof row.source_url === "string" ? row.source_url : null, creator: typeof row.creator === "string" ? row.creator : null,
    licenseName: typeof row.license_name === "string" ? row.license_name : null, licenseUrl: typeof row.license_url === "string" ? row.license_url : null,
    licenseSnapshot: typeof row.license_snapshot === "string" ? row.license_snapshot : null, retrievedAt: String(row.retrieved_at),
    storageProvider: "vercel_blob", storageLocator: String(row.storage_locator), filename: String(row.filename), mimeType: String(row.mime_type),
    sizeBytes: Number(row.size_bytes || 0), sha256: typeof row.sha256 === "string" ? row.sha256 : null,
    duration: row.duration == null ? null : Number(row.duration), width: row.width == null ? null : Number(row.width), height: row.height == null ? null : Number(row.height), fps: row.fps == null ? null : Number(row.fps),
    tags: Array.isArray(row.tags) ? row.tags.filter((value): value is string => typeof value === "string") : [],
    description: typeof row.description === "string" ? row.description : null, generationPrompt: typeof row.generation_prompt === "string" ? row.generation_prompt : null,
    generationModel: typeof row.generation_model === "string" ? row.generation_model : null, reusable: Boolean(row.reusable),
    rightsFlags: row.rights_flags && typeof row.rights_flags === "object" ? row.rights_flags as Record<string, boolean> : {}, revision: Number(row.revision || 1)
  };
}

export async function GET(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const projectId = new URL(request.url).searchParams.get("projectId") || "";
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) return NextResponse.json({ error: "projectId is required." }, { status: 400 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });

  const [projectResult, rowsResult] = await Promise.all([
    service.from("video_producer_projects").select("id,title,mode,status,source_filename,approval_fingerprint").eq("id", projectId).is("deleted_at", null).maybeSingle(),
    service.from("video_producer_visual_placements")
      .select("id,project_id,beat_id,asset_id,source_start,source_end,asset_in,asset_out,fit,position_x,position_y,scale,layer,audio_enabled,source,locked,revision,asset:video_producer_visual_assets(*)")
      .eq("project_id", projectId).eq("active", true).order("source_start")
  ]);
  if (projectResult.error) return NextResponse.json({ error: projectResult.error.message }, { status: 500 });
  if (rowsResult.error) return NextResponse.json({ error: rowsResult.error.message }, { status: 500 });
  if (!projectResult.data) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const pairs = (rowsResult.data ?? []).flatMap((row) => {
    const value = row as unknown as Record<string, unknown>;
    const assetValue = value.asset && typeof value.asset === "object" ? value.asset as Record<string, unknown> : null;
    return assetValue ? [{ placement: placement(value), asset: asset(assetValue) }] : [];
  });
  const placements = pairs.map((item) => item.placement);
  const assets = pairs.map((item) => item.asset);
  const assembly = buildVideoProducerPremiereAssembly({ projectId, placements, assets });
  const media = await Promise.all(assets.map(async (item) => ({
    assetId: item.id,
    filename: item.filename,
    provider: item.sourceProvider,
    sha256: item.sha256 ?? null,
    revision: item.revision,
    downloadUrl: await createPrivateBlobDownloadUrl(item.storageLocator, 60 * 60 * 1000)
  })));
  const licenseManifest = buildVideoProducerLicenseManifest({ projectId, placements, assets });
  return NextResponse.json({
    project: projectResult.data,
    assembly,
    media,
    licenseManifest,
    contract: {
      target: "Adobe Premiere UXP",
      authority: "assembly",
      videoTracks: { aroll: "V1", broll: "V2", graphics: "V3" },
      audioPolicy: "Preserve the selected A-roll/external master audio under Visual Pass clips.",
      editorMayMoveTrimReplace: true
    }
  });
}
