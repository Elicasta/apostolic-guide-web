import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { pathwayBySlug } from "@/pathway-catalog";
import { hashAudioText, pathwayNarrationHash } from "@/pathway-audio";
import { concatenatePcm16Segments, MAX_PATHWAY_AUDIO_SCRIPT_CHARS, PATHWAY_TTS_INSTRUCTIONS, pcm16MonoToWav, resolveTtsSpeed, splitNarrationForTts } from "@/pathway-audio-render";
import { masterPathwayPcm16Mono, PATHWAY_MASTERING_PROFILE } from "@/pathway-audio-mastering";
import { createServiceClient } from "@/supabase";

export const runtime = "nodejs";
export const maxDuration = 300;

const schema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  force: z.boolean().optional().default(false)
});

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

  const scriptResult = await service.from("pathway_audio_scripts").select("script_text,source_hash,script_hash,status").eq("pathway_slug", pathway.slug).maybeSingle();
  const script = scriptResult.data;
  if (!script || script.status !== "approved") return NextResponse.json({ error: "Approve the narration script before generating audio." }, { status: 409 });
  if (script.source_hash !== pathwayNarrationHash(pathway)) return NextResponse.json({ error: "The Pathway changed after this script was created. Regenerate or review the script before producing audio." }, { status: 409 });

  const narration = String(script.script_text).trim();
  const contentHash = hashAudioText(narration);
  if (contentHash !== script.script_hash) return NextResponse.json({ error: "Approved script hash mismatch. Save and approve the script again." }, { status: 409 });
  if (narration.length > MAX_PATHWAY_AUDIO_SCRIPT_CHARS) return NextResponse.json({ error: `Approved script is ${narration.length.toLocaleString()} characters. The current long-form limit is ${MAX_PATHWAY_AUDIO_SCRIPT_CHARS.toLocaleString()} characters.` }, { status: 422 });

  const existing = await service.from("pathway_audio_assets").select("pathway_slug,audio_url,storage_path,content_hash,model,voice,generated_at").eq("pathway_slug", pathway.slug).maybeSingle();
  if (!parsed.data.force && existing.data?.content_hash === contentHash && existing.data?.audio_url) return NextResponse.json({ asset: existing.data, generated: false, segments: null, format: existing.data.storage_path?.endsWith(".wav") ? "wav" : "unknown" });

  const chunks = splitNarrationForTts(narration);
  if (!chunks.length) return NextResponse.json({ error: "Approved script is empty." }, { status: 422 });

  const model = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
  const voice = process.env.OPENAI_TTS_VOICE || "cedar";
  const speed = resolveTtsSpeed(process.env.OPENAI_TTS_SPEED);
  const pcmSegments: Buffer[] = [];

  for (let index = 0; index < chunks.length; index += 1) {
    const speech = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model,
        voice,
        input: chunks[index],
        response_format: "pcm",
        speed,
        instructions: PATHWAY_TTS_INSTRUCTIONS
      })
    });

    if (!speech.ok) {
      const detail = (await speech.text().catch(() => "")).slice(0, 1000);
      return NextResponse.json({ error: `Audio generation failed on lossless segment ${index + 1} of ${chunks.length} (${speech.status}).`, detail }, { status: 502 });
    }
    pcmSegments.push(Buffer.from(await speech.arrayBuffer()));
  }

  let audio: Buffer;
  try {
    const combinedPcm = concatenatePcm16Segments(pcmSegments);
    const masteredPcm = masterPathwayPcm16Mono(combinedPcm);
    audio = pcm16MonoToWav(masteredPcm);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Lossless audio segments could not be mastered and combined." }, { status: 502 });
  }

  const objectPath = `pathways/${pathway.slug}/${contentHash.slice(0, 16)}-${PATHWAY_MASTERING_PROFILE}-${Date.now().toString(36)}.wav`;
  const upload = await service.storage.from("pathway-audio").upload(objectPath, audio, { contentType: "audio/wav", cacheControl: "31536000", upsert: false });
  if (upload.error) return NextResponse.json({ error: upload.error.message }, { status: 500 });

  const publicUrl = service.storage.from("pathway-audio").getPublicUrl(objectPath).data.publicUrl;
  const generatedAt = new Date().toISOString();
  const row = { pathway_slug: pathway.slug, audio_url: publicUrl, storage_path: objectPath, content_hash: contentHash, model, voice, generated_at: generatedAt, generated_by: access.user.id };
  const saved = await service.from("pathway_audio_assets").upsert(row, { onConflict: "pathway_slug" }).select("pathway_slug,audio_url,content_hash,model,voice,generated_at").single();
  if (saved.error) {
    await service.storage.from("pathway-audio").remove([objectPath]);
    return NextResponse.json({ error: saved.error.message }, { status: 500 });
  }

  const previousStoragePath = existing.data?.storage_path ? String(existing.data.storage_path) : null;
  if (previousStoragePath && previousStoragePath !== objectPath) {
    const cleanup = await service.storage.from("pathway-audio").remove([previousStoragePath]);
    if (cleanup.error) console.error("pathway audio cleanup failed", { pathway: pathway.slug, message: cleanup.error.message });
  }

  revalidatePath(`/pathways/${pathway.slug}`);
  revalidatePath("/admin/audio");
  return NextResponse.json({ asset: saved.data, generated: true, segments: chunks.length, speed, format: "wav", lossless: true, mastering: PATHWAY_MASTERING_PROFILE });
}
