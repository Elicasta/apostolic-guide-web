import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";

const editSchema = z.object({
  title: z.string().trim().min(1).max(220),
  body: z.string().max(100000),
  status: z.enum(["draft", "ready", "archived"]).default("draft")
});

function slugify(value: string) {
  return value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 140) || "episode-article";
}
function articleFromScript(title: string, premise: string, script: string) {
  const cleaned = script
    .replace(/^\s*(?:CEDAR|HOST|GUEST(?:\s+\d+)?|SPEAKER(?:\s+\d+)?)\s*:\s*/gim, "")
    .replace(/^\s*\[[^\]]+\]\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const intro = premise.trim();
  return [`# ${title.trim()}`, intro && intro !== cleaned.slice(0, intro.length) ? intro : "", cleaned].filter(Boolean).join("\n\n");
}

export async function POST(_request: Request, context: { params: Promise<{ episodeId: string }> }) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { episodeId } = await context.params;
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });
  const episodeResult = await service.from("video_producer_episode_scripts").select("id,title,premise,script_text,primary_pathway_slug,updated_at").eq("id", episodeId).maybeSingle();
  if (episodeResult.error) return NextResponse.json({ error: episodeResult.error.message }, { status: 500 });
  if (!episodeResult.data) return NextResponse.json({ error: "Episode was not found." }, { status: 404 });
  if (!String(episodeResult.data.script_text || "").trim()) return NextResponse.json({ error: "Write or generate the Episode script before creating an article draft." }, { status: 409 });
  const body = articleFromScript(episodeResult.data.title, episodeResult.data.premise || "", episodeResult.data.script_text);
  const payload = {
    episode_id: episodeResult.data.id,
    title: episodeResult.data.title,
    slug: slugify(episodeResult.data.title),
    body,
    status: "draft",
    primary_pathway_slug: episodeResult.data.primary_pathway_slug,
    source_script_updated_at: episodeResult.data.updated_at,
    updated_by: access.user.id,
    updated_at: new Date().toISOString()
  };
  const existing = await service.from("studio_episode_articles").select("id").eq("episode_id", episodeId).maybeSingle();
  if (existing.error) return NextResponse.json({ error: existing.error.message }, { status: 500 });
  const saved = existing.data
    ? await service.from("studio_episode_articles").update(payload).eq("id", existing.data.id).select("*").single()
    : await service.from("studio_episode_articles").insert({ ...payload, created_by: access.user.id }).select("*").single();
  if (saved.error) return NextResponse.json({ error: saved.error.message }, { status: 500 });
  return NextResponse.json({ article: saved.data, reused: Boolean(existing.data) }, { status: existing.data ? 200 : 201 });
}

export async function PATCH(request: Request, context: { params: Promise<{ episodeId: string }> }) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { episodeId } = await context.params;
  const parsed = editSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid article draft." }, { status: 400 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });
  const saved = await service.from("studio_episode_articles").update({
    title: parsed.data.title,
    slug: slugify(parsed.data.title),
    body: parsed.data.body,
    status: parsed.data.status,
    updated_by: access.user.id,
    updated_at: new Date().toISOString()
  }).eq("episode_id", episodeId).select("*").maybeSingle();
  if (saved.error) return NextResponse.json({ error: saved.error.message }, { status: 500 });
  if (!saved.data) return NextResponse.json({ error: "Create the article draft from the Episode first." }, { status: 404 });
  return NextResponse.json({ article: saved.data });
}

export async function GET(_request: Request, context: { params: Promise<{ episodeId: string }> }) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { episodeId } = await context.params;
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });
  const result = await service.from("studio_episode_articles").select("*").eq("episode_id", episodeId).maybeSingle();
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
  return NextResponse.json({ article: result.data ?? null });
}
