import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { pathwayBySlug } from "@/pathway-catalog";
import { normalizePathwayVideoTimeline } from "@/pathway-video";
import { createServiceClient } from "@/supabase";

const cueSchema = z.object({
  id: z.string().min(1).max(120),
  start: z.number().finite().min(0).max(60 * 60),
  kind: z.enum(["question", "brand", "scripture", "statement", "recap", "cta"]),
  eyebrow: z.string().max(120),
  title: z.string().max(220),
  body: z.string().max(500),
  reference: z.string().max(120)
});

const schema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  timeline: z.array(cueSchema).min(1).max(80),
  style: z.record(z.string(), z.unknown()).optional().default({})
});

export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid video project." }, { status: 400 });

  const pathway = pathwayBySlug(parsed.data.slug);
  if (!pathway) return NextResponse.json({ error: "Pathway not found." }, { status: 404 });

  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });

  const assetResult = await service.from("pathway_audio_assets").select("content_hash,audio_url").eq("pathway_slug", pathway.slug).maybeSingle();
  if (assetResult.error) return NextResponse.json({ error: assetResult.error.message }, { status: 500 });
  if (!assetResult.data?.audio_url) return NextResponse.json({ error: "Generate Pathway audio before saving a video project." }, { status: 409 });

  const timeline = normalizePathwayVideoTimeline(parsed.data.timeline, Number.MAX_SAFE_INTEGER);
  const now = new Date().toISOString();
  const row = {
    pathway_slug: pathway.slug,
    audio_content_hash: assetResult.data.content_hash,
    timeline,
    style: parsed.data.style,
    updated_by: access.user.id,
    updated_at: now
  };

  const saved = await service.from("pathway_video_projects").upsert({ ...row, created_by: access.user.id }, { onConflict: "pathway_slug" }).select("id,pathway_slug,audio_content_hash,timeline,style,updated_at").single();
  if (saved.error) return NextResponse.json({ error: saved.error.message }, { status: 500 });
  return NextResponse.json({ project: saved.data });
}
