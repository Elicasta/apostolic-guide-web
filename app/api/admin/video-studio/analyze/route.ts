import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { pathwayBySlug } from "@/pathway-catalog";
import { alignPathwayVideoTimeline, type TimedTranscriptWord } from "@/pathway-video-alignment";
import { createServiceClient } from "@/supabase";

export const runtime = "nodejs";
export const maxDuration = 300;

const schema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  force: z.boolean().optional().default(false)
});

type WhisperVerboseResponse = {
  duration?: number;
  text?: string;
  words?: Array<{ word?: string; start?: number; end?: number }>;
};

function audioFileName(contentType: string) {
  if (contentType.includes("wav")) return "pathway.wav";
  if (contentType.includes("mpeg") || contentType.includes("mp3")) return "pathway.mp3";
  if (contentType.includes("mp4") || contentType.includes("m4a")) return "pathway.m4a";
  if (contentType.includes("ogg")) return "pathway.ogg";
  return "pathway.wav";
}

export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid Pathway request." }, { status: 400 });
  const pathway = pathwayBySlug(parsed.data.slug);
  if (!pathway) return NextResponse.json({ error: "Pathway not found." }, { status: 404 });

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 503 });

  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });

  const [assetResult, scriptResult, existingProjectResult] = await Promise.all([
    service.from("pathway_audio_assets").select("audio_url,content_hash").eq("pathway_slug", pathway.slug).maybeSingle(),
    service.from("pathway_audio_scripts").select("script_text,script_hash,status").eq("pathway_slug", pathway.slug).maybeSingle(),
    service.from("pathway_video_projects").select("id,audio_content_hash,timeline,style,updated_at").eq("pathway_slug", pathway.slug).maybeSingle()
  ]);
  if (assetResult.error) return NextResponse.json({ error: assetResult.error.message }, { status: 500 });
  if (scriptResult.error) return NextResponse.json({ error: scriptResult.error.message }, { status: 500 });
  if (existingProjectResult.error) return NextResponse.json({ error: existingProjectResult.error.message }, { status: 500 });

  const asset = assetResult.data;
  const script = scriptResult.data;
  if (!asset?.audio_url) return NextResponse.json({ error: "Generate Pathway audio before analyzing video timing." }, { status: 409 });
  if (!script?.script_text || script.status !== "approved") return NextResponse.json({ error: "Approve the Pathway narration script before analyzing video timing." }, { status: 409 });

  const existing = existingProjectResult.data;
  const existingStyle = existing?.style && typeof existing.style === "object" ? existing.style as Record<string, unknown> : {};
  const existingAlignment = existingStyle.alignment && typeof existingStyle.alignment === "object" ? existingStyle.alignment as Record<string, unknown> : null;
  if (!parsed.data.force && existing?.audio_content_hash === asset.content_hash && existingAlignment?.status === "aligned" && Array.isArray(existing.timeline) && existing.timeline.length) {
    return NextResponse.json({ project: existing, alignment: existingAlignment, analyzed: false });
  }

  const audioResponse = await fetch(asset.audio_url, { cache: "no-store" });
  if (!audioResponse.ok) return NextResponse.json({ error: `Source audio could not be downloaded (${audioResponse.status}).` }, { status: 502 });
  const audioBytes = await audioResponse.arrayBuffer();
  if (!audioBytes.byteLength) return NextResponse.json({ error: "Source audio is empty." }, { status: 502 });

  const contentType = audioResponse.headers.get("content-type") || "audio/wav";
  const form = new FormData();
  form.append("file", new Blob([audioBytes], { type: contentType }), audioFileName(contentType));
  form.append("model", process.env.OPENAI_VIDEO_TRANSCRIBE_MODEL?.trim() || "whisper-1");
  form.append("language", "en");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");
  form.append("temperature", "0");
  form.append("prompt", [pathway.title, ...pathway.steps.map((step) => step.reference)].join(", ").slice(0, 900));

  const transcriptionResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}` },
    body: form
  });
  if (!transcriptionResponse.ok) {
    const detail = (await transcriptionResponse.text().catch(() => "")).slice(0, 1200);
    return NextResponse.json({ error: `Audio timing analysis failed (${transcriptionResponse.status}).`, detail }, { status: 502 });
  }

  const transcription = await transcriptionResponse.json() as WhisperVerboseResponse;
  const words: TimedTranscriptWord[] = (transcription.words ?? []).flatMap((word) => {
    if (typeof word.word !== "string" || typeof word.start !== "number" || typeof word.end !== "number") return [];
    return [{ word: word.word, start: word.start, end: word.end }];
  });
  if (!words.length) return NextResponse.json({ error: "The transcription returned no word timestamps." }, { status: 502 });

  const duration = typeof transcription.duration === "number" && transcription.duration > 0 ? transcription.duration : (words.at(-1)?.end ?? 0);
  const alignment = alignPathwayVideoTimeline({ source: pathway, scriptText: script.script_text, transcriptWords: words, duration });
  const analyzedAt = new Date().toISOString();
  const style = {
    ...existingStyle,
    brandVersion: 1,
    alignment: {
      status: "aligned",
      method: "approved-script-word-alignment",
      transcriptionModel: process.env.OPENAI_VIDEO_TRANSCRIBE_MODEL?.trim() || "whisper-1",
      scriptHash: script.script_hash,
      audioContentHash: asset.content_hash,
      analyzedAt,
      confidence: alignment.confidence,
      alignmentCoverage: alignment.alignmentCoverage,
      matchedScriptureCues: alignment.matchedScriptureCues,
      totalScriptureCues: alignment.totalScriptureCues
    }
  };

  const row = {
    pathway_slug: pathway.slug,
    audio_content_hash: asset.content_hash,
    timeline: alignment.timeline,
    style,
    updated_by: access.user.id,
    updated_at: analyzedAt
  };
  const saved = await service.from("pathway_video_projects")
    .upsert({ ...row, created_by: access.user.id }, { onConflict: "pathway_slug" })
    .select("id,pathway_slug,audio_content_hash,timeline,style,updated_at")
    .single();
  if (saved.error) return NextResponse.json({ error: saved.error.message }, { status: 500 });

  return NextResponse.json({ project: saved.data, alignment: style.alignment, analyzed: true, transcriptWordCount: words.length });
}
