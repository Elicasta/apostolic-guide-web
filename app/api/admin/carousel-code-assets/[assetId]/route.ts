import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";
export async function GET(
  _request: Request,
  context: { params: Promise<{ assetId: string }> },
) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { assetId } = await context.params;
  if (!z.string().uuid().safeParse(assetId).success)
    return NextResponse.json({ error: "Invalid asset ID" }, { status: 400 });
  const service = createServiceClient();
  if (!service)
    return NextResponse.json(
      { error: "Supabase unavailable" },
      { status: 503 },
    );
  const r = await service
    .from("studio_pathway_assets")
    .select("storage_bucket,storage_path")
    .eq("id", assetId)
    .single();
  if (r.error)
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  const signed = await service.storage
    .from(r.data.storage_bucket)
    .createSignedUrl(r.data.storage_path, 3600);
  if (signed.error)
    return NextResponse.json({ error: "Asset unavailable" }, { status: 404 });
  return NextResponse.redirect(signed.data.signedUrl, {
    headers: { "cache-control": "private,no-store" },
  });
}
