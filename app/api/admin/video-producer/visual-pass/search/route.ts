import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";
import { createPrivateBlobDownloadUrl } from "@/video-producer-server";
import { searchRealVisualCandidates } from "@/video-producer-visual-providers";
import type { VideoProducerVisualBeat } from "@/video-producer-visuals";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({ beatId: z.string().uuid() });

function toBeat(row: Record<string, unknown>): VideoProducerVisualBeat {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    sourceStart: Number(row.source_start),
    duration: Number(row.duration),
    dialogue: String(row.dialogue ?? ""),
    recommendation: String(row.recommendation) as VideoProducerVisualBeat["recommendation"],
    intent: String(row.intent ?? ""),
    searchQueries: Array.isArray(row.search_queries) ? row.search_queries.filter((value): value is string => typeof value === "string") : [],
    vocabulary: String(row.vocabulary) as VideoProducerVisualBeat["vocabulary"],
    preferredStyle: typeof row.preferred_style === "string" ? row.preferred_style : undefined,
    avoid: Array.isArray(row.avoid) ? row.avoid.filter((value): value is string => typeof value === "string") : [],
    status: String(row.status) as VideoProducerVisualBeat["status"],
    source: String(row.source) as VideoProducerVisualBeat["source"],
    revision: Number(row.revision || 1)
  };
}

export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid visual search request." }, { status: 400 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });

  const beatResult = await service.from("video_producer_visual_beats").select("*").eq("id", parsed.data.beatId).maybeSingle();
  if (beatResult.error) return NextResponse.json({ error: beatResult.error.message }, { status: 500 });
  if (!beatResult.data) return NextResponse.json({ error: "Visual beat not found." }, { status: 404 });
  if (beatResult.data.recommendation !== "b-roll") return NextResponse.json({ error: "This beat intentionally recommends something other than B-roll." }, { status: 409 });

  const projectResult = await service.from("video_producer_projects")
    .select("id,mode,pathway_slug,status")
    .eq("id", beatResult.data.project_id).is("deleted_at", null).maybeSingle();
  if (projectResult.error) return NextResponse.json({ error: projectResult.error.message }, { status: 500 });
  if (!projectResult.data || (projectResult.data.mode !== "podcast" && projectResult.data.mode !== "reels")) return NextResponse.json({ error: "Video Producer project not found." }, { status: 404 });
  if (projectResult.data.status === "rendering") return NextResponse.json({ error: "Wait for the current render before changing visuals." }, { status: 409 });

  try {
    await service.from("video_producer_visual_beats").update({ status: "searching", updated_by: access.user.id }).eq("id", parsed.data.beatId);
    const candidates = await searchRealVisualCandidates({
      service,
      beat: toBeat(beatResult.data as Record<string, unknown>),
      pathwaySlug: projectResult.data.pathway_slug,
      mode: projectResult.data.mode,
      limit: 6
    });

    const cleared = await service.from("video_producer_visual_candidates").delete().eq("beat_id", parsed.data.beatId);
    if (cleared.error) throw new Error(cleared.error.message);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const stored = candidates.length ? await service.from("video_producer_visual_candidates").insert(candidates.map((candidate) => ({
      beat_id: parsed.data.beatId,
      provider: candidate.provider,
      provider_asset_id: candidate.providerAssetId ?? null,
      title: candidate.title,
      preview_url: candidate.previewUrl ?? null,
      source_url: candidate.sourceUrl ?? null,
      download_url: candidate.downloadUrl ?? null,
      creator: candidate.creator ?? null,
      duration: candidate.duration ?? null,
      width: candidate.width ?? null,
      height: candidate.height ?? null,
      score: candidate.score ?? null,
      license_name: candidate.licenseName ?? null,
      license_url: candidate.licenseUrl ?? null,
      metadata: candidate.metadata ?? {},
      expires_at: expiresAt
    }))).select("*") : { data: [], error: null };
    if (stored.error) throw new Error(stored.error.message);

    const responseCandidates = await Promise.all((stored.data ?? []).map(async (candidate) => {
      const metadata = candidate.metadata && typeof candidate.metadata === "object" ? candidate.metadata as Record<string, unknown> : {};
      const storageLocator = typeof metadata.storageLocator === "string" ? metadata.storageLocator : "";
      const previewUrl = storageLocator ? await createPrivateBlobDownloadUrl(storageLocator, 60 * 60 * 1000) : candidate.preview_url;
      return { ...candidate, download_url: undefined, preview_url: previewUrl };
    }));
    await service.from("video_producer_visual_beats").update({ status: "open", updated_by: access.user.id }).eq("id", parsed.data.beatId);
    return NextResponse.json({ candidates: responseCandidates, searchedRealFirst: true, limit: 6 });
  } catch (error) {
    await service.from("video_producer_visual_beats").update({ status: "open", updated_by: access.user.id }).eq("id", parsed.data.beatId);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Visual search failed." }, { status: 502 });
  }
}
