import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { pathwayBySlug } from "@/pathway-catalog";
import { alignPathwayVideoTimeline, type TimedTranscriptWord } from "@/pathway-video-alignment";
import {
  normalizeDirectedPathwayVideoCues,
  PATHWAY_VIDEO_DIRECTOR_SCHEMA,
  type DirectedPathwayVideoCue
} from "@/pathway-video-director";
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

function extractResponseText(value: unknown) {
  const response = value && typeof value === "object" ? value as Record<string, unknown> : {};
  if (typeof response.output_text === "string") return response.output_text;
  if (!Array.isArray(response.output)) return "";
  for (const item of response.output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const record = part as Record<string, unknown>;
      if (record.type === "output_text" && typeof record.text === "string") return record.text;
    }
  }
  return "";
}

async function directTalkingPoints(input: {
  apiKey: string;
  model: string;
  title: string;
  summary: string;
  script: string;
  scriptureFlow: string;
  duration: number;
  scriptureCount: number;
}): Promise<DirectedPathwayVideoCue[]> {
  const targetTotal = Math.max(16, Math.min(22, Math.round(input.duration / 16)));
  const fixedCueCount = input.scriptureCount + 2; // brand + Scripture cards + CTA
  const requested = Math.max(6, Math.min(16, targetTotal - fixedCueCount));
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${input.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: input.model,
      reasoning: { effort: "medium" },
      text: {
        verbosity: "low",
        format: {
          type: "json_schema",
          name: "apostolic_guide_video_director",
          strict: true,
          schema: PATHWAY_VIDEO_DIRECTOR_SCHEMA
        }
      },
      input: [
        {
          role: "developer",
          content: [{ type: "input_text", text: [
            "You are directing an audio-first Apostolic Guide Scripture video.",
            "The approved narration is the theological source of truth. Do not add doctrine, historical claims, illustrations, or conclusions that are not in it.",
            `Create exactly ${requested} additional visual talking-point cues. Scripture cards are added separately by the system, so do not return Scripture-card duplicates.`,
            "The intended rhythm is the richer master template: opening question, brand moment, Scripture card, supporting statement, supporting statement when the narration supports it, next Scripture card, and so on, followed by recap/final declaration/CTA.",
            "For a roughly five-minute video the finished timeline should feel active but restrained, normally around 18 to 21 total visual beats.",
            "Return one QUESTION cue near the opening, several STATEMENT cues distributed through the teaching, and one RECAP cue near the conclusion. Statements should surface the strongest actual claims being spoken, not generic headings.",
            "Every anchorText MUST be an exact contiguous phrase copied verbatim from the approved narration. Use 4 to 12 words when possible. This anchor is used to place the cue automatically against word timestamps.",
            "Do not use an anchor from a Scripture quotation merely to create another Scripture card. Anchor supporting claims in the narrator's explanation.",
            "Titles should be short enough to read instantly on YouTube, usually 2 to 8 words. Use line breaks only when they materially improve emphasis.",
            "Bodies should be one short supporting line, not paragraphs. Eyebrows should identify the current idea or Scripture context.",
            "Use uppercase editorial copy for eyebrow/title/reference fields. Keep body in normal sentence case unless a short all-caps phrase is visually stronger.",
            "Avoid filler such as WHAT THIS MEANS, KEY POINT, IMPORTANT TRUTH, or generic section labels when the narration contains a stronger phrase."
          ].join("\n") }]
        },
        {
          role: "user",
          content: [{ type: "input_text", text: [
            `PATHWAY: ${input.title}`,
            `SUMMARY: ${input.summary}`,
            `DURATION: ${input.duration.toFixed(2)} seconds`,
            `SCRIPTURE FLOW: ${input.scriptureFlow}`,
            "APPROVED NARRATION:",
            input.script
          ].join("\n\n") }]
        }
      ]
    })
  });
  if (!response.ok) throw new Error(`Video director failed (${response.status}): ${(await response.text().catch(() => "")).slice(0, 800)}`);
  const result = await response.json();
  const output = extractResponseText(result);
  if (!output) throw new Error("Video director returned no structured output.");
  const parsed = JSON.parse(output) as unknown;
  return normalizeDirectedPathwayVideoCues(parsed);
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
  const transcriptionModel = process.env.OPENAI_VIDEO_TRANSCRIBE_MODEL?.trim() || "whisper-1";
  if (transcriptionModel !== "whisper-1") return NextResponse.json({ error: "Video Studio word timing currently requires OPENAI_VIDEO_TRANSCRIBE_MODEL=whisper-1." }, { status: 503 });
  const directorModel = process.env.OPENAI_VIDEO_DIRECTOR_MODEL?.trim() || "gpt-5.6-sol";

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
  if (!script.script_hash || script.script_hash !== asset.content_hash) return NextResponse.json({ error: "The approved script changed after this audio was generated. Regenerate the Pathway audio before analyzing video timing." }, { status: 409 });

  const existing = existingProjectResult.data;
  const existingStyle = existing?.style && typeof existing.style === "object" ? existing.style as Record<string, unknown> : {};
  const existingAlignment = existingStyle.alignment && typeof existingStyle.alignment === "object" ? existingStyle.alignment as Record<string, unknown> : null;
  if (
    !parsed.data.force &&
    existing &&
    existing.audio_content_hash === asset.content_hash &&
    existingAlignment?.status === "aligned-rich" &&
    existingAlignment?.scriptHash === script.script_hash &&
    Array.isArray(existing.timeline) &&
    existing.timeline.length >= 12
  ) {
    return NextResponse.json({ project: existing, alignment: existingAlignment, analyzed: false });
  }

  const audioResponse = await fetch(asset.audio_url, { cache: "no-store" });
  if (!audioResponse.ok) return NextResponse.json({ error: `Source audio could not be downloaded (${audioResponse.status}).` }, { status: 502 });
  const audioBytes = await audioResponse.arrayBuffer();
  if (!audioBytes.byteLength) return NextResponse.json({ error: "Source audio is empty." }, { status: 502 });

  const contentType = audioResponse.headers.get("content-type") || "audio/wav";
  const form = new FormData();
  form.append("file", new Blob([audioBytes], { type: contentType }), audioFileName(contentType));
  form.append("model", transcriptionModel);
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
  let directedCues: DirectedPathwayVideoCue[] = [];
  let directorError: string | null = null;
  try {
    directedCues = await directTalkingPoints({
      apiKey,
      model: directorModel,
      title: pathway.title,
      summary: pathway.summary,
      script: script.script_text,
      scriptureFlow: pathway.steps.map((step) => `${step.reference} — ${step.title}`).join(" | "),
      duration,
      scriptureCount: pathway.steps.length
    });
  } catch (error) {
    directorError = error instanceof Error ? error.message : "Video director failed.";
    console.error("video studio rich cue direction failed; using rich deterministic fallback", directorError);
  }

  const alignment = alignPathwayVideoTimeline({
    source: pathway,
    scriptText: script.script_text,
    transcriptWords: words,
    duration,
    directedCues
  });
  const analyzedAt = new Date().toISOString();
  const style = {
    ...existingStyle,
    brandVersion: 2,
    template: "audio-first-rich-v1",
    alignment: {
      status: "aligned-rich",
      method: directedCues.length ? "gpt-directed-approved-script-word-alignment" : "approved-script-word-alignment-rich-fallback",
      transcriptionModel,
      directorModel: directedCues.length ? directorModel : null,
      directorError,
      scriptHash: script.script_hash,
      audioContentHash: asset.content_hash,
      analyzedAt,
      confidence: alignment.confidence,
      alignmentCoverage: alignment.alignmentCoverage,
      matchedScriptureCues: alignment.matchedScriptureCues,
      totalScriptureCues: alignment.totalScriptureCues,
      matchedDirectedCues: alignment.matchedDirectedCues,
      totalDirectedCues: alignment.totalDirectedCues,
      totalVideoCues: alignment.totalVideoCues
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

  return NextResponse.json({
    project: saved.data,
    alignment: style.alignment,
    analyzed: true,
    transcriptWordCount: words.length,
    directorFallback: !directedCues.length
  });
}
