import { NextRequest, NextResponse } from "next/server";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";

const CONTENT_TYPES = ["video","reel","carousel","post","story","thumbnail","image","thread","music","podcast"];
const STATUSES = ["idea","draft","ready","scheduled","published","failed","cancelled"] as const;

function validDate(value: unknown) {
  if (value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export async function GET(request: NextRequest) {
  const { access, allowed } = await getStudioPermission("view_distribution");
  if (!allowed || access.state !== "allowed") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  const url = new URL(request.url);
  const platform = url.searchParams.get("platform")?.trim();
  const from = url.searchParams.get("from")?.trim();
  const to = url.searchParams.get("to")?.trim();
  let query = service.from("studio_content_calendar_items")
    .select("id,pathway_slug,title,content_type,platform,status,scheduled_for,published_at,source,source_ref,asset_id,publication_id,metadata,created_at,updated_at")
    .neq("status", "cancelled")
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("scheduled_for", { ascending: true, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .limit(500);
  if (platform) query = query.eq("platform", platform);
  if (from) query = query.gte("published_at", from);
  if (to) query = query.lte("published_at", to);
  const result = await query;
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
  return NextResponse.json({ items: result.data ?? [] });
}

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
  if (!title || !CONTENT_TYPES.includes(contentType)) {
    return NextResponse.json({ error: "A valid title and content type are required." }, { status: 400 });
  }
  const row = {
    pathway_slug: body.pathwaySlug ? String(body.pathwaySlug) : null,
    title,
    content_type: contentType,
    platform: body.platform ? String(body.platform) : null,
    status: body.status && STATUSES.includes(String(body.status) as typeof STATUSES[number]) ? String(body.status) : "draft",
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

export async function PATCH(request: NextRequest) {
  const { access, allowed } = await getStudioPermission("manage_distribution");
  if (!allowed || access.state !== "allowed") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  const body = await request.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) return NextResponse.json({ error: "Calendar item id is required." }, { status: 400 });

  const current = await service.from("studio_content_calendar_items")
    .select("id,status,scheduled_for,published_at,platform")
    .eq("id", id)
    .maybeSingle();
  if (current.error) return NextResponse.json({ error: current.error.message }, { status: 500 });
  if (!current.data) return NextResponse.json({ error: "Calendar item not found." }, { status: 404 });

  const values: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (Object.prototype.hasOwnProperty.call(body, "scheduledFor")) {
    const scheduledFor = validDate(body.scheduledFor);
    if (scheduledFor === undefined) return NextResponse.json({ error: "Schedule time is invalid." }, { status: 400 });
    values.scheduled_for = scheduledFor;
    if (scheduledFor && current.data.status !== "published") values.status = "scheduled";
    if (!scheduledFor && current.data.status === "scheduled") values.status = "draft";
  }
  if (typeof body.status === "string") {
    const status = body.status.trim() as typeof STATUSES[number];
    if (!STATUSES.includes(status)) return NextResponse.json({ error: "Calendar status is invalid." }, { status: 400 });
    values.status = status;
    if (status !== "scheduled" && status !== "published" && !Object.prototype.hasOwnProperty.call(body, "scheduledFor")) values.scheduled_for = null;
  }
  if (Object.prototype.hasOwnProperty.call(body, "platform")) values.platform = body.platform ? String(body.platform).trim() : null;
  if (typeof body.title === "string" && body.title.trim()) values.title = body.title.trim().slice(0, 240);

  const updated = await service.from("studio_content_calendar_items").update(values).eq("id", id).select("*").single();
  if (updated.error) return NextResponse.json({ error: updated.error.message }, { status: 500 });
  return NextResponse.json({ item: updated.data });
}
