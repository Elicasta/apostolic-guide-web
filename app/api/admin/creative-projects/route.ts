import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import {
  CREATIVE_FORMATS,
  CREATIVE_INTENTS,
  CREATIVE_STATUSES,
  createDefaultFrames,
  recommendedFrameCount
} from "@/creative-project";
import { creativeProjectFromRow } from "@/creative-project-server";
import { pathwayBySlug } from "@/pathway-catalog";
import { createServiceClient } from "@/supabase";

const createSchema = z.object({
  title: z.string().trim().min(1).max(180).optional(),
  pathwaySlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  intent: z.enum(CREATIVE_INTENTS),
  format: z.enum(CREATIVE_FORMATS),
  destination: z.string().trim().min(1).max(80).optional().default("instagram"),
  frameCount: z.number().int().min(1).max(20).optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(30).optional().default([])
});

function safeSearch(value: string) {
  return value.replace(/[%,]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
}

export async function GET(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  const url = new URL(request.url);
  const status = url.searchParams.get("status") || "";
  const format = url.searchParams.get("format") || "";
  const pathwaySlug = url.searchParams.get("pathwaySlug") || "";
  const search = safeSearch(url.searchParams.get("q") || "");
  const includeArchived = url.searchParams.get("includeArchived") === "true";

  if (status && !CREATIVE_STATUSES.includes(status as typeof CREATIVE_STATUSES[number])) return NextResponse.json({ error: "Invalid status filter." }, { status: 400 });
  if (format && !CREATIVE_FORMATS.includes(format as typeof CREATIVE_FORMATS[number])) return NextResponse.json({ error: "Invalid format filter." }, { status: 400 });
  if (pathwaySlug && !pathwayBySlug(pathwaySlug)) return NextResponse.json({ error: "Pathway not found." }, { status: 404 });

  let query = service.from("studio_creative_projects").select("*").order("updated_at", { ascending: false }).limit(300);
  if (status) query = query.eq("status", status);
  else if (!includeArchived) query = query.neq("status", "archived");
  if (format) query = query.eq("format", format);
  if (pathwaySlug) query = query.eq("pathway_slug", pathwaySlug);
  if (search) query = query.ilike("search_text", `%${search}%`);

  const result = await query;
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
  return NextResponse.json({ projects: (result.data ?? []).map((row) => creativeProjectFromRow(row as Record<string, unknown>)) });
}

export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid Creative Project." }, { status: 400 });
  const pathway = pathwayBySlug(parsed.data.pathwaySlug);
  if (!pathway) return NextResponse.json({ error: "Pathway not found." }, { status: 404 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  const requestedCount = parsed.data.frameCount ?? recommendedFrameCount(parsed.data.format, parsed.data.intent, pathway.steps.length);
  const frames = createDefaultFrames(parsed.data.format, requestedCount).map((frame, index, all) => ({
    ...frame,
    pathwayLink: `/pathways/${pathway.slug}`,
    scripture: index > 0 && index < all.length - 1 ? pathway.steps[Math.min(index - 1, pathway.steps.length - 1)]?.reference ?? "" : ""
  }));
  const title = parsed.data.title || `${pathway.title} · ${parsed.data.intent[0].toUpperCase()}${parsed.data.intent.slice(1)} ${parsed.data.format === "single" ? "Single Post" : parsed.data.format === "story" ? "Story" : "Carousel"}`;
  const now = new Date().toISOString();
  const searchText = [title, pathway.title, pathway.slug, parsed.data.intent, parsed.data.format, ...frames.map((frame) => frame.scripture), ...parsed.data.tags].join(" ");
  const created = await service.from("studio_creative_projects").insert({
    title,
    pathway_slug: pathway.slug,
    pathway_collection: pathway.collection,
    intent: parsed.data.intent,
    format: parsed.data.format,
    destination: parsed.data.destination,
    frame_count: frames.length,
    status: "draft",
    editor_state: { frames, visualSettings: {}, sourceImages: [] },
    tags: parsed.data.tags,
    scripture_references: frames.map((frame) => frame.scripture).filter(Boolean),
    search_text: searchText,
    state_version: 1,
    last_autosaved_at: now,
    created_by: access.user.id,
    updated_by: access.user.id,
    created_at: now,
    updated_at: now
  }).select("*").single();
  if (created.error) return NextResponse.json({ error: created.error.message }, { status: 500 });
  return NextResponse.json({ project: creativeProjectFromRow(created.data as Record<string, unknown>) }, { status: 201 });
}
