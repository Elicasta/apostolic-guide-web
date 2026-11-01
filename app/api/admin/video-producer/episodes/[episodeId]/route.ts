import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { pathwayBySlug } from "@/pathway-catalog";
import { createServiceClient } from "@/supabase";
import { EPISODE_FORMATS, episodeSpeakerSchema } from "@/video-producer-episode-script";

const updateSchema = z.object({
  title: z.string().trim().min(1).max(180).optional(),
  premise: z.string().trim().max(6000).optional(),
  primaryPathwaySlug: z.string().trim().min(1).max(100).optional(),
  supportingPathwaySlugs: z.array(z.string().trim().min(1).max(100)).max(5).optional(),
  format: z.enum(EPISODE_FORMATS).optional(),
  speakers: z.array(episodeSpeakerSchema).min(1).max(4).optional(),
  scriptText: z.string().max(50000).optional()
});

export async function PATCH(request: Request, context: { params: Promise<{ episodeId: string }> }) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { episodeId } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(episodeId)) return NextResponse.json({ error: "Invalid episode ID." }, { status: 400 });
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid episode update." }, { status: 400 });
  if (parsed.data.primaryPathwaySlug && !pathwayBySlug(parsed.data.primaryPathwaySlug)) return NextResponse.json({ error: "Primary Pathway was not found." }, { status: 400 });
  if (parsed.data.supportingPathwaySlugs?.some((slug) => !pathwayBySlug(slug))) return NextResponse.json({ error: "One of the supporting Pathways was not found." }, { status: 400 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });

  const patch: Record<string, unknown> = { updated_by: access.user.id };
  if (parsed.data.title !== undefined) patch.title = parsed.data.title;
  if (parsed.data.premise !== undefined) patch.premise = parsed.data.premise;
  if (parsed.data.primaryPathwaySlug !== undefined) patch.primary_pathway_slug = parsed.data.primaryPathwaySlug;
  if (parsed.data.supportingPathwaySlugs !== undefined) patch.supporting_pathway_slugs = [...new Set(parsed.data.supportingPathwaySlugs)].filter((slug) => slug !== parsed.data.primaryPathwaySlug);
  if (parsed.data.format !== undefined) patch.format = parsed.data.format;
  if (parsed.data.speakers !== undefined) patch.speakers = parsed.data.speakers;
  if (parsed.data.scriptText !== undefined) patch.script_text = parsed.data.scriptText;
  if (["title", "premise", "primaryPathwaySlug", "supportingPathwaySlugs", "format", "speakers", "scriptText"].some((key) => key in parsed.data)) {
    patch.status = "draft";
    patch.theology_review = null;
    patch.approved_at = null;
  }

  const result = await service.from("video_producer_episode_scripts").update(patch).eq("id", episodeId).select("*").single();
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
  return NextResponse.json({ episode: result.data });
}

export async function DELETE(_request: Request, context: { params: Promise<{ episodeId: string }> }) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { episodeId } = await context.params;
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });
  const result = await service.from("video_producer_episode_scripts").delete().eq("id", episodeId);
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
