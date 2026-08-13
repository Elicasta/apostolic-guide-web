import { NextRequest, NextResponse } from "next/server";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";

export async function POST(request: NextRequest) {
  const { access, allowed } = await getStudioPermission("manage_distribution");
  if (!allowed || access.state !== "allowed") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const body = await request.json().catch(() => ({}));
  const title = String(body.title || "").trim();
  const contentType = String(body.contentType || "").trim();
  const source = String(body.source || "studio").trim();
  const sourceRef = String(body.sourceRef || "").trim() || null;
  if (!title || !["video","reel","carousel","post","thread","music","podcast"].includes(contentType)) {
    return NextResponse.json({ error: "A valid title and content type are required." }, { status: 400 });
  }
  const row = {
    pathway_slug: body.pathwaySlug ? String(body.pathwaySlug) : null,
    title,
    content_type: contentType,
    platform: body.platform ? String(body.platform) : null,
    status: body.status && ["idea","draft","ready","scheduled","published","failed","cancelled"].includes(String(body.status)) ? String(body.status) : "draft",
    scheduled_for: body.scheduledFor || null,
    published_at: body.publishedAt || null,
    source,
    source_ref: sourceRef,
    asset_id: body.assetId || null,
    publication_id: body.publicationId || null,
    metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
    updated_at: new Date().toISOString()
  };
  const query = sourceRef
    ? service.from("studio_content_calendar_items").upsert(row, { onConflict: "source,source_ref" }).select("*").single()
    : service.from("studio_content_calendar_items").insert(row).select("*").single();
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}
