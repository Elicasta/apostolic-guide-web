import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { pathwayBySlug } from "@/pathway-catalog";
import { hashAudioText, pathwayNarrationHash } from "@/pathway-audio";
import { MAX_PATHWAY_AUDIO_SCRIPT_CHARS } from "@/pathway-audio-render";
import { createServiceClient } from "@/supabase";

export const runtime = "nodejs";

const schema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  scriptText: z.string().trim().min(100).max(MAX_PATHWAY_AUDIO_SCRIPT_CHARS),
  action: z.enum(["save", "approve"])
});

export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: `Script must be between 100 and ${MAX_PATHWAY_AUDIO_SCRIPT_CHARS.toLocaleString()} characters.` }, { status: 400 });

  const pathway = pathwayBySlug(parsed.data.slug);
  if (!pathway) return NextResponse.json({ error: "Pathway not found" }, { status: 404 });

  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });

  const existing = await service.from("pathway_audio_scripts").select("model,generated_at,generated_by").eq("pathway_slug", pathway.slug).maybeSingle();
  const now = new Date().toISOString();
  const approved = parsed.data.action === "approve";
  const row = {
    pathway_slug: pathway.slug,
    script_text: parsed.data.scriptText,
    source_hash: pathwayNarrationHash(pathway),
    script_hash: hashAudioText(parsed.data.scriptText),
    status: approved ? "approved" : "draft",
    model: existing.data?.model ?? null,
    generated_at: existing.data?.generated_at ?? null,
    generated_by: existing.data?.generated_by ?? null,
    approved_at: approved ? now : null,
    approved_by: approved ? access.user.id : null,
    updated_at: now
  };

  const saved = await service.from("pathway_audio_scripts").upsert(row, { onConflict: "pathway_slug" }).select("*").single();
  if (saved.error) return NextResponse.json({ error: saved.error.message }, { status: 500 });

  return NextResponse.json({ script: saved.data });
}
