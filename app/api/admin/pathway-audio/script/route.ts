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

  const existing = await service.from("pathway_audio_scripts")
    .select("source_hash,script_hash,model,generated_at,generated_by,checker_status,checker_model,checked_script_hash,checker_result,checked_at")
    .eq("pathway_slug", pathway.slug)
    .maybeSingle();
  if (existing.error) return NextResponse.json({ error: existing.error.message }, { status: 500 });

  const scriptText = parsed.data.scriptText.trim();
  const scriptHash = hashAudioText(scriptText);
  const sourceHash = pathwayNarrationHash(pathway);
  const checkerCurrent = existing.data?.checker_status === "passed"
    && existing.data.checked_script_hash === scriptHash
    && existing.data.source_hash === sourceHash;

  if (parsed.data.action === "approve" && !checkerCurrent) {
    return NextResponse.json({ error: "Run the script checker on this exact draft before approval." }, { status: 409 });
  }

  const now = new Date().toISOString();
  const approved = parsed.data.action === "approve";
  const row = {
    pathway_slug: pathway.slug,
    script_text: scriptText,
    source_hash: sourceHash,
    script_hash: scriptHash,
    status: approved ? "approved" : "draft",
    model: existing.data?.model ?? null,
    generated_at: existing.data?.generated_at ?? null,
    generated_by: existing.data?.generated_by ?? null,
    approved_at: approved ? now : null,
    approved_by: approved ? access.user.id : null,
    checker_status: checkerCurrent ? existing.data?.checker_status ?? null : null,
    checker_model: checkerCurrent ? existing.data?.checker_model ?? null : null,
    checked_script_hash: checkerCurrent ? existing.data?.checked_script_hash ?? null : null,
    checker_result: checkerCurrent ? existing.data?.checker_result ?? {} : {},
    checked_at: checkerCurrent ? existing.data?.checked_at ?? null : null,
    updated_at: now
  };

  const saved = await service.from("pathway_audio_scripts").upsert(row, { onConflict: "pathway_slug" }).select("*").single();
  if (saved.error) return NextResponse.json({ error: saved.error.message }, { status: 500 });

  return NextResponse.json({ script: saved.data });
}
