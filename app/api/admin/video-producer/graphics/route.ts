import { NextResponse } from "next/server";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";
import { serializeVideoProducerGraphicAsset } from "@/video-producer-graphic-assets";
import { createPrivateBlobDownloadUrl } from "@/video-producer-server";

export const runtime = "nodejs";

export async function GET() {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });

  const result = await service.from("video_producer_graphic_assets")
    .select("id,title,kind,formats,text_behavior,max_lines,text_alignment,reference_zone,display_behavior,fixed_text,storage_provider,storage_locator,filename,content_type,size_bytes,tags,notes,active,created_at,updated_at")
    .eq("active", true)
    .order("updated_at", { ascending: false })
    .limit(250);
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });

  const assets = await Promise.all((result.data ?? []).map(async (asset) =>
    serializeVideoProducerGraphicAsset(
      asset,
      await createPrivateBlobDownloadUrl(asset.storage_locator, 45 * 60 * 1000)
    )
  ));

  return NextResponse.json({ assets });
}
