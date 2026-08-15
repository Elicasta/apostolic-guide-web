import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { pathwayBySlug } from "@/pathway-catalog";
import { createServiceClient } from "@/supabase";

export const runtime = "nodejs";

const createSchema = z.object({
  title: z.string().trim().min(1).max(180),
  mode: z.enum(["podcast", "reels"]),
  pathwaySlug: z.string().trim().min(1).max(100).optional(),
  parentProjectId: z.string().uuid().optional(),
  sourceRangeStart: z.number().min(0).optional(),
  sourceRangeEnd: z.number().positive().optional()
}).refine((value) => value.sourceRangeStart == null || value.sourceRangeEnd == null || value.sourceRangeEnd > value.sourceRangeStart, {
  message: "Source range end must be after source range start."
});

export async function GET() {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });
  const result = await service.from("video_producer_projects")
    .select("id,title,mode,status,parent_project_id,source_provider,source_locator,source_filename,source_mime_type,source_size_bytes,source_duration,source_range_start,source_range_end,transcript_text,edit_plan,director_metadata,reel_candidates,approval_fingerprint,approved_at,created_at,updated_at")
    .order("updated_at", { ascending: false })
    .limit(50);
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
  return NextResponse.json({ projects: result.data ?? [] });
}

export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid project request." }, { status: 400 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });

  const requestedPathway = parsed.data.pathwaySlug ? pathwayBySlug(parsed.data.pathwaySlug) : null;
  if (parsed.data.pathwaySlug && !requestedPathway) return NextResponse.json({ error: "Unknown pathway." }, { status: 400 });

  let inherited: Record<string, unknown> = {};
  if (parsed.data.parentProjectId) {
    if (parsed.data.mode !== "reels") return NextResponse.json({ error: "Only Reels projects can inherit a parent source." }, { status: 400 });
    const parent = await service.from("video_producer_projects")
      .select("id,mode,pathway_slug,source_provider,source_locator,source_filename,source_mime_type,source_size_bytes,source_duration,transcript_text,transcript")
      .eq("id", parsed.data.parentProjectId)
      .maybeSingle();
    if (parent.error) return NextResponse.json({ error: parent.error.message }, { status: 500 });
    if (!parent.data || parent.data.mode !== "podcast" || !parent.data.source_locator) return NextResponse.json({ error: "Approved podcast source was not found." }, { status: 404 });
    inherited = {
      pathway_slug: parent.data.pathway_slug,
      source_provider: parent.data.source_provider,
      source_locator: parent.data.source_locator,
      source_filename: parent.data.source_filename,
      source_mime_type: parent.data.source_mime_type,
      source_size_bytes: parent.data.source_size_bytes,
      source_duration: parent.data.source_duration,
      transcript_text: parent.data.transcript_text,
      transcript: parent.data.transcript,
      status: parent.data.transcript_text ? "uploaded" : "draft"
    };
  }

  const created = await service.from("video_producer_projects").insert({
    title: parsed.data.title,
    mode: parsed.data.mode,
    pathway_slug: requestedPathway?.slug ?? null,
    parent_project_id: parsed.data.parentProjectId ?? null,
    source_range_start: parsed.data.sourceRangeStart ?? null,
    source_range_end: parsed.data.sourceRangeEnd ?? null,
    created_by: access.user.id,
    updated_by: access.user.id,
    ...inherited
  }).select("*").single();
  if (created.error) return NextResponse.json({ error: created.error.message }, { status: 500 });
  return NextResponse.json({ project: created.data }, { status: 201 });
}
