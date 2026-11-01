import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { pathwayBySlug } from "@/pathway-catalog";
import { createServiceClient } from "@/supabase";

const filtersSchema = z.object({
  query: z.string().max(300).optional().default(""),
  studioScope: z.enum(["all", "carousel", "video"]).optional().default("all"),
  group: z.enum(["all", "visual", "copy", "output"]).optional().default("all"),
  status: z.enum(["all", "draft", "review", "approved", "ready", "published"]).optional().default("all"),
  favoritesOnly: z.boolean().optional().default(false),
  sort: z.enum(["updated", "title", "status"]).optional().default("updated")
});

const saveSchema = z.object({
  id: z.string().uuid().optional(),
  pathwaySlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().trim().min(1).max(80),
  filters: filtersSchema
});

const deleteSchema = z.object({ id: z.string().uuid() });

export async function GET(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(request.url);
  const pathwaySlug = url.searchParams.get("pathwaySlug")?.trim() || "";
  if (!pathwaySlug || !pathwayBySlug(pathwaySlug)) return NextResponse.json({ error: "Pathway not found." }, { status: 404 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  const result = await service.from("studio_pathway_asset_views")
    .select("id,pathway_slug,name,filters,created_at,updated_at")
    .eq("user_id", access.user.id)
    .eq("pathway_slug", pathwaySlug)
    .order("updated_at", { ascending: false });
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
  return NextResponse.json({ views: result.data ?? [] });
}

export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = saveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid saved view." }, { status: 400 });
  if (!pathwayBySlug(parsed.data.pathwaySlug)) return NextResponse.json({ error: "Pathway not found." }, { status: 404 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  const now = new Date().toISOString();
  if (parsed.data.id) {
    const updated = await service.from("studio_pathway_asset_views").update({
      name: parsed.data.name,
      filters: parsed.data.filters,
      updated_at: now
    }).eq("id", parsed.data.id).eq("user_id", access.user.id).eq("pathway_slug", parsed.data.pathwaySlug).select("*").maybeSingle();
    if (updated.error) return NextResponse.json({ error: updated.error.message }, { status: updated.error.code === "23505" ? 409 : 500 });
    if (!updated.data) return NextResponse.json({ error: "Saved view not found." }, { status: 404 });
    return NextResponse.json({ view: updated.data });
  }

  const created = await service.from("studio_pathway_asset_views").insert({
    user_id: access.user.id,
    pathway_slug: parsed.data.pathwaySlug,
    name: parsed.data.name,
    filters: parsed.data.filters,
    created_at: now,
    updated_at: now
  }).select("*").single();
  if (created.error) return NextResponse.json({ error: created.error.code === "23505" ? "A saved view with that name already exists for this Pathway." : created.error.message }, { status: created.error.code === "23505" ? 409 : 500 });
  return NextResponse.json({ view: created.data });
}

export async function DELETE(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid saved view." }, { status: 400 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  const result = await service.from("studio_pathway_asset_views").delete().eq("id", parsed.data.id).eq("user_id", access.user.id).select("id").maybeSingle();
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
  if (!result.data) return NextResponse.json({ error: "Saved view not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
