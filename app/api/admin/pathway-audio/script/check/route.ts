import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { pathwayBySlug } from "@/pathway-catalog";
import { buildPathwayNarration, hashAudioText, pathwayNarrationHash } from "@/pathway-audio";
import { MAX_PATHWAY_AUDIO_SCRIPT_CHARS } from "@/pathway-audio-render";
import { runPathwayAudioScriptCheck } from "@/pathway-audio-script-checker";
import { createServiceClient } from "@/supabase";

export const runtime = "nodejs";
export const maxDuration = 120;

const schema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  scriptText: z.string().trim().min(100).max(MAX_PATHWAY_AUDIO_SCRIPT_CHARS)
});

export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: `Script must be between 100 and ${MAX_PATHWAY_AUDIO_SCRIPT_CHARS.toLocaleString()} characters.` }, { status: 400 });

  const pathway = pathwayBySlug(parsed.data.slug);
  if (!pathway) return NextResponse.json({ error: "Pathway not found" }, { status: 404 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 503 });

  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });

  const scriptText = parsed.data.scriptText.trim();
  const scriptHash = hashAudioText(scriptText);
  const sourceHash = pathwayNarrationHash(pathway);
  const model = process.env.OPENAI_SCRIPT_CHECK_MODEL || process.env.OPENAI_SCRIPT_MODEL || "gpt-5-mini";

  let result;
  try {
    result = await runPathwayAudioScriptCheck({
      apiKey,
      model,
      source: buildPathwayNarration(pathway),
      scriptText
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Script checker failed." }, { status: 502 });
  }

  const existing = await service.from("pathway_audio_scripts")
    .select("script_hash,source_hash,status,model,generated_at,generated_by,approved_at,approved_by")
    .eq("pathway_slug", pathway.slug)
    .maybeSingle();
  if (existing.error) return NextResponse.json({ error: existing.error.message }, { status: 500 });

  const preserveApproval = existing.data?.status === "approved"
    && existing.data.script_hash === scriptHash
    && existing.data.source_hash === sourceHash
    && result.verdict === "passed";
  const now = new Date().toISOString();
  const row = {
    pathway_slug: pathway.slug,
    script_text: scriptText,
    source_hash: sourceHash,
    script_hash: scriptHash,
    status: preserveApproval ? "approved" : "draft",
    model: existing.data?.model ?? null,
    generated_at: existing.data?.generated_at ?? null,
    generated_by: existing.data?.generated_by ?? null,
    approved_at: preserveApproval ? existing.data?.approved_at ?? null : null,
    approved_by: preserveApproval ? existing.data?.approved_by ?? null : null,
    checker_status: result.verdict,
    checker_model: model,
    checked_script_hash: scriptHash,
    checker_result: result,
    checked_at: now,
    updated_at: now
  };

  const saved = await service.from("pathway_audio_scripts").upsert(row, { onConflict: "pathway_slug" }).select("*").single();
  if (saved.error) return NextResponse.json({ error: saved.error.message }, { status: 500 });

  return NextResponse.json({ script: saved.data, check: result });
}
