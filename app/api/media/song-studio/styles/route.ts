import { NextResponse } from "next/server";
import { z } from "zod";
import { listSongStyles, requireSongStudioAccess } from "@/song-studio/server";

export const runtime = "nodejs";

const styleSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120),
  description: z.string().trim().max(1000).default(""),
  musical_family: z.string().trim().max(300).default(""),
  vocal_texture: z.string().trim().max(500).default(""),
  instrumentation: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  tempo_min: z.number().int().min(40).max(220).nullable().default(null),
  tempo_max: z.number().int().min(40).max(220).nullable().default(null),
  energy: z.number().int().min(0).max(100).default(50),
  congregation_fit: z.number().int().min(0).max(100).default(80),
  suno_style_prompt: z.string().trim().max(3000).default(""),
  negative_style_notes: z.array(z.string().trim().min(1).max(160)).max(30).default([])
}).refine((value) => value.tempo_min === null || value.tempo_max === null || value.tempo_min <= value.tempo_max, {
  message: "tempo_min must be less than or equal to tempo_max"
});

export async function GET() {
  const auth = await requireSongStudioAccess();
  if (!auth.ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    return NextResponse.json({ styles: await listSongStyles() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load styles." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireSongStudioAccess();
  if (!auth.ok || !auth.service || !auth.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = styleSchema.omit({ id: true }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid style profile.", issues: parsed.error.flatten() }, { status: 400 });

  const created = await auth.service.from("song_style_profiles").insert({
    ...parsed.data,
    is_system: false,
    created_by: auth.user.id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }).select("*").single();
  if (created.error) return NextResponse.json({ error: created.error.message }, { status: created.error.code === "23505" ? 409 : 500 });
  return NextResponse.json({ style: created.data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await requireSongStudioAccess();
  if (!auth.ok || !auth.service) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = styleSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !parsed.data.id) return NextResponse.json({ error: "Invalid style update.", issues: parsed.success ? undefined : parsed.error.flatten() }, { status: 400 });

  const existing = await auth.service.from("song_style_profiles").select("is_system").eq("id", parsed.data.id).maybeSingle();
  if (existing.error) return NextResponse.json({ error: existing.error.message }, { status: 500 });
  if (!existing.data) return NextResponse.json({ error: "Style not found." }, { status: 404 });
  if (existing.data.is_system) return NextResponse.json({ error: "System style profiles are read-only. Duplicate one before editing it." }, { status: 409 });

  const { id, ...changes } = parsed.data;
  const updated = await auth.service.from("song_style_profiles").update({ ...changes, updated_at: new Date().toISOString() }).eq("id", id).select("*").single();
  if (updated.error) return NextResponse.json({ error: updated.error.message }, { status: 500 });
  return NextResponse.json({ style: updated.data });
}
