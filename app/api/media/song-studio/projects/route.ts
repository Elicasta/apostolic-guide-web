import { NextResponse } from "next/server";
import { z } from "zod";
import { SONG_STATUSES, SONG_TYPES } from "@/song-studio/types";
import { getSongStudioBootstrap, requireSongStudioAccess } from "@/song-studio/server";

export const runtime = "nodejs";

const createSchema = z.object({
  title: z.string().trim().min(1).max(160).default("Untitled Song"),
  song_type: z.enum(SONG_TYPES).default("declaration"),
  theological_center: z.string().trim().max(1000).default(""),
  core_scriptures: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  audience_context: z.string().trim().max(500).default("Congregational church worship"),
  desired_tone: z.string().trim().max(500).default("Scripture-rich, reverent, singable"),
  creative_brief: z.string().trim().max(5000).default(""),
  style_profile_id: z.string().uuid().nullable().optional()
});

const patchSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(160).optional(),
  working_title: z.string().trim().min(1).max(160).optional(),
  status: z.enum(SONG_STATUSES).optional(),
  song_type: z.enum(SONG_TYPES).optional(),
  theological_center: z.string().trim().max(1000).optional(),
  core_scriptures: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  audience_context: z.string().trim().max(500).optional(),
  desired_tone: z.string().trim().max(500).optional(),
  creative_brief: z.string().trim().max(5000).optional(),
  style_profile_id: z.string().uuid().nullable().optional(),
  distribution_metadata: z.record(z.string(), z.unknown()).optional()
});

export async function GET() {
  const auth = await requireSongStudioAccess();
  if (!auth.ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    return NextResponse.json(await getSongStudioBootstrap());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load songs." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireSongStudioAccess();
  if (!auth.ok || !auth.service || !auth.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid song project.", issues: parsed.error.flatten() }, { status: 400 });

  const now = new Date().toISOString();
  const created = await auth.service.from("song_projects").insert({
    ...parsed.data,
    working_title: parsed.data.title,
    status: "idea",
    created_by: auth.user.id,
    created_at: now,
    updated_at: now
  }).select("*").single();

  if (created.error) return NextResponse.json({ error: created.error.message }, { status: 500 });
  return NextResponse.json({ project: created.data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await requireSongStudioAccess();
  if (!auth.ok || !auth.service) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid project update.", issues: parsed.error.flatten() }, { status: 400 });

  const { id, ...changes } = parsed.data;
  const updated = await auth.service.from("song_projects").update({ ...changes, updated_at: new Date().toISOString() }).eq("id", id).select("*").single();
  if (updated.error) return NextResponse.json({ error: updated.error.message }, { status: updated.error.code === "PGRST116" ? 404 : 500 });
  return NextResponse.json({ project: updated.data });
}
