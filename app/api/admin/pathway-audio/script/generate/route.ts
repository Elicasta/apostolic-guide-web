import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { pathwayBySlug } from "@/pathway-catalog";
import { buildPathwayNarration, hashAudioText, pathwayNarrationHash } from "@/pathway-audio";
import { buildPathwayAudioScriptPrompt } from "@/pathway-audio-script";
import { createServiceClient } from "@/supabase";

export const runtime = "nodejs";

const schema = z.object({ slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) });

type ResponsePayload = {
  output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
};

function extractOutputText(payload: ResponsePayload) {
  return (payload.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((part) => part.type === "output_text" && typeof part.text === "string")
    .map((part) => part.text!.trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid pathway request" }, { status: 400 });

  const pathway = pathwayBySlug(parsed.data.slug);
  if (!pathway) return NextResponse.json({ error: "Pathway not found" }, { status: 404 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 503 });

  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });

  const source = buildPathwayNarration(pathway);
  const sourceHash = pathwayNarrationHash(pathway);
  const model = process.env.OPENAI_SCRIPT_MODEL || "gpt-5-mini";
  const prompt = buildPathwayAudioScriptPrompt(source);

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ model, input: prompt, max_output_tokens: 1200 })
  });

  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 1000);
    return NextResponse.json({ error: `Script generation failed (${response.status}).`, detail }, { status: 502 });
  }

  const payload = await response.json() as ResponsePayload;
  const scriptText = extractOutputText(payload);
  if (scriptText.length < 100) return NextResponse.json({ error: "The model returned an empty or incomplete script." }, { status: 502 });
  if (scriptText.length > 4096) return NextResponse.json({ error: `Generated script is ${scriptText.length} characters. Generate again or shorten it before approval.` }, { status: 422 });

  const now = new Date().toISOString();
  const row = {
    pathway_slug: pathway.slug,
    script_text: scriptText,
    source_hash: sourceHash,
    script_hash: hashAudioText(scriptText),
    status: "draft",
    model,
    generated_at: now,
    generated_by: access.user.id,
    approved_at: null,
    approved_by: null,
    updated_at: now
  };
  const saved = await service.from("pathway_audio_scripts").upsert(row, { onConflict: "pathway_slug" }).select("*").single();
  if (saved.error) return NextResponse.json({ error: saved.error.message }, { status: 500 });

  return NextResponse.json({ script: saved.data });
}
