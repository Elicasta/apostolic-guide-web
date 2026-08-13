import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { pathwayBySlug } from "@/pathway-catalog";
import { createServiceClient } from "@/supabase";

export const runtime = "nodejs";
export const maxDuration = 300;

const requestSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  force: z.boolean().optional().default(false)
});

type WhisperWord = { word?: string; start?: number; end?: number };
type WhisperVerboseResponse = { duration?: number; text?: string; words?: WhisperWord[] };
type TimedToken = { value: string; start: number; end: number; wordIndex: number };
type CaptionCue = { start: number; end: number; text: string };

type Candidate = {
  platform: "instagram" | "tiktok" | "both";
  score: number;
  startAnchor: string;
  endAnchor: string;
  hook: string;
  title: string;
  rationale: string;
  instagramCaption: string;
  tiktokCaption: string;
  hashtags: string[];
  coverHeadline: string;
  coverSubline: string;
};

const CLIP_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["candidates"],
  properties: {
    candidates: {
      type: "array",
      minItems: 4,
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "platform", "score", "startAnchor", "endAnchor", "hook", "title", "rationale",
          "instagramCaption", "tiktokCaption", "hashtags", "coverHeadline", "coverSubline"
        ],
        properties: {
          platform: { type: "string", enum: ["instagram", "tiktok", "both"] },
          score: { type: "integer", minimum: 0, maximum: 100 },
          startAnchor: { type: "string" },
          endAnchor: { type: "string" },
          hook: { type: "string" },
          title: { type: "string" },
          rationale: { type: "string" },
          instagramCaption: { type: "string" },
          tiktokCaption: { type: "string" },
          hashtags: {
            type: "array",
            minItems: 4,
            maxItems: 8,
            items: { type: "string" }
          },
          coverHeadline: { type: "string" },
          coverSubline: { type: "string" }
        }
      }
    }
  }
} as const;

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

function normalizeToken(value: string) {
  return value.normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function splitTokens(value: string) {
  return (value.match(/[\p{L}\p{N}]+/gu) ?? []).map(normalizeToken).filter(Boolean);
}

function transcriptTokens(words: WhisperWord[]) {
  const tokens: TimedToken[] = [];
  words.forEach((word, wordIndex) => {
    if (typeof word.word !== "string" || typeof word.start !== "number" || typeof word.end !== "number") return;
    for (const value of splitTokens(word.word)) tokens.push({ value, start: word.start, end: word.end, wordIndex });
  });
  return tokens;
}

function findPhrase(tokens: TimedToken[], phrase: string, fromIndex = 0) {
  const needle = splitTokens(phrase);
  if (!needle.length) return null;
  for (let index = Math.max(0, fromIndex); index <= tokens.length - needle.length; index += 1) {
    let matches = true;
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (tokens[index + offset].value !== needle[offset]) {
        matches = false;
        break;
      }
    }
    if (matches) return { index, endIndex: index + needle.length - 1 };
  }
  return null;
}

function cleanCueText(parts: string[]) {
  return parts.join(" ")
    .replace(/\s+([,.;!?])/g, "$1")
    .replace(/\s+(['’]s)\b/gi, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function buildCaptionCues(words: WhisperWord[], clipStart: number, clipEnd: number) {
  const timed = words.flatMap((word) => {
    if (typeof word.word !== "string" || typeof word.start !== "number" || typeof word.end !== "number") return [];
    if (word.end < clipStart || word.start > clipEnd) return [];
    return [{
      text: word.word.trim(),
      start: Math.max(0, word.start - clipStart),
      end: Math.max(0.05, Math.min(clipEnd, word.end) - clipStart)
    }];
  }).filter((word) => word.text);

  const cues: CaptionCue[] = [];
  let bucket: typeof timed = [];
  const flush = () => {
    if (!bucket.length) return;
    const text = cleanCueText(bucket.map((word) => word.text));
    if (text) cues.push({
      start: Number(Math.max(0, bucket[0].start - 0.04).toFixed(2)),
      end: Number((bucket.at(-1)?.end ?? bucket[0].end + 0.4).toFixed(2)),
      text
    });
    bucket = [];
  };

  for (const word of timed) {
    bucket.push(word);
    const duration = bucket.at(-1)!.end - bucket[0].start;
    const sentenceEnd = /[.!?][\"'’”)]?$/.test(word.text);
    const commaBreak = /[,;:][\"'’”)]?$/.test(word.text) && bucket.length >= 3;
    if (sentenceEnd || commaBreak || bucket.length >= 5 || duration >= 1.65) flush();
  }
  flush();
  return cues.slice(0, 48);
}

function resolveCandidate(candidate: Candidate, tokens: TimedToken[], words: WhisperWord[], duration: number) {
  const startMatch = findPhrase(tokens, candidate.startAnchor);
  if (!startMatch) return null;
  const endMatch = findPhrase(tokens, candidate.endAnchor, startMatch.index + 1);
  if (!endMatch) return null;

  // Give the first spoken word room to breathe so clips never begin on a clipped consonant.
  const start = Math.max(0, tokens[startMatch.index].start - 0.45);
  const end = Math.min(duration, tokens[endMatch.endIndex].end + 0.65);
  const clipDuration = end - start;
  if (clipDuration < 14 || clipDuration > 70) return null;
  return {
    ...candidate,
    startSeconds: Number(start.toFixed(2)),
    endSeconds: Number(end.toFixed(2)),
    durationSeconds: Number(clipDuration.toFixed(2)),
    captionCues: buildCaptionCues(words, start, end)
  };
}

async function chooseCandidates(input: {
  apiKey: string;
  model: string;
  title: string;
  summary: string;
  script: string;
  scriptureFlow: string;
  duration: number;
}) {
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
          name: "apostolic_guide_social_clip_selector_v2",
          strict: true,
          schema: CLIP_SCHEMA
        }
      },
      input: [
        {
          role: "developer",
          content: [{ type: "input_text", text: [
            "You are the short-form editor for Apostolic Guide. Select social clips from an approved Apostolic Guide narration for Instagram Reels and TikTok.",
            "The approved narration is the doctrinal source of truth. Never invent, intensify, flatten, or distort a theological claim for engagement.",
            "Return exactly four ranked candidates. Optimize for retention, rewatchability, saves, shares, and a clean handoff into the full Pathway.",
            "Prefer self-contained segments roughly 20 to 55 seconds long. Slightly outside that range is allowed only to finish the thought accurately.",
            "The first spoken sentence must work immediately. Prefer a direct claim, question, Scriptural contrast, objection, or memorable line. Reject greetings and throat-clearing.",
            "IMPORTANT: startAnchor must begin at the natural beginning of the spoken sentence or complete clause. Never choose an anchor that starts halfway through a thought. endAnchor must finish a complete thought.",
            "startAnchor and endAnchor MUST each be exact contiguous phrases copied verbatim from the approved narration, normally 4 to 12 words. The endAnchor must occur after the startAnchor.",
            "Score 0 to 100 using hook strength, retention, clarity, completeness, emotional/intellectual tension, shareability, and faithfulness to context.",
            "Use platform 'both' unless a cut is materially better suited to only Instagram or only TikTok.",
            "hook is the exact core idea the viewer hears, not invented clickbait. title is a short internal label. rationale is one sentence explaining why the cut can hold attention.",
            "Write a distinct Instagram caption and TikTok caption for each cut. Instagram can be slightly more reflective. TikTok should be shorter and faster. Both should point naturally toward the full Pathway without sounding promotional.",
            "Return 4 to 8 useful hashtags. Mix broad discovery tags with Apostolic/doctrine-specific tags. Do not spam unrelated trending tags.",
            "coverHeadline should be 2 to 6 words and readable on a vertical cover. coverSubline should be a short clarifier, usually 3 to 9 words. Neither may misrepresent the clip."
          ].join("\n") }]
        },
        {
          role: "user",
          content: [{ type: "input_text", text: [
            `PATHWAY: ${input.title}`,
            `SUMMARY: ${input.summary}`,
            `AUDIO DURATION: ${input.duration.toFixed(2)} seconds`,
            `SCRIPTURE FLOW: ${input.scriptureFlow}`,
            "APPROVED NARRATION:",
            input.script
          ].join("\n\n") }]
        }
      ]
    })
  });
  if (!response.ok) throw new Error(`Social clip selector failed (${response.status}): ${(await response.text().catch(() => "")).slice(0, 900)}`);
  const payload = await response.json();
  const text = extractResponseText(payload);
  if (!text) throw new Error("Social clip selector returned no structured output.");
  const parsed = JSON.parse(text) as { candidates?: Candidate[] };
  return Array.isArray(parsed.candidates) ? parsed.candidates : [];
}

export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_distribution");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid Pathway request." }, { status: 400 });
  const pathway = pathwayBySlug(parsed.data.slug);
  if (!pathway) return NextResponse.json({ error: "Pathway not found." }, { status: 404 });

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 503 });
  const transcriptionModel = process.env.OPENAI_VIDEO_TRANSCRIBE_MODEL?.trim() || "whisper-1";
  if (transcriptionModel !== "whisper-1") return NextResponse.json({ error: "AI clip timing currently requires OPENAI_VIDEO_TRANSCRIBE_MODEL=whisper-1." }, { status: 503 });
  const model = process.env.OPENAI_SOCIAL_CLIP_MODEL?.trim() || process.env.OPENAI_VIDEO_PUBLISHING_MODEL?.trim() || "gpt-5.6-sol";

  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });

  const [audioResult, scriptResult, renderResult, existingResult] = await Promise.all([
    service.from("pathway_audio_assets").select("audio_url,content_hash").eq("pathway_slug", pathway.slug).maybeSingle(),
    service.from("pathway_audio_scripts").select("script_text,script_hash,status").eq("pathway_slug", pathway.slug).maybeSingle(),
    service.from("pathway_video_renders")
      .select("id,output_url,completed_at")
      .eq("pathway_slug", pathway.slug)
      .eq("format", "vertical")
      .eq("status", "completed")
      .not("output_url", "is", null)
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    service.from("pathway_social_clips")
      .select("id,pathway_slug,source_render_id,platform,rank,score,start_seconds,end_seconds,hook,title,rationale,caption,status,output_url,error,model,analysis_metadata,created_at,completed_at")
      .eq("pathway_slug", pathway.slug)
      .neq("status", "archived")
      .order("rank", { ascending: true })
      .order("created_at", { ascending: false })
  ]);

  if (audioResult.error) return NextResponse.json({ error: audioResult.error.message }, { status: 500 });
  if (scriptResult.error) return NextResponse.json({ error: scriptResult.error.message }, { status: 500 });
  if (renderResult.error) return NextResponse.json({ error: renderResult.error.message }, { status: 500 });
  if (existingResult.error) return NextResponse.json({ error: existingResult.error.message }, { status: 500 });

  const audio = audioResult.data;
  const script = scriptResult.data;
  const verticalRender = renderResult.data;
  if (!audio?.audio_url) return NextResponse.json({ error: "Generate Pathway audio first." }, { status: 409 });
  if (!script?.script_text || script.status !== "approved") return NextResponse.json({ error: "Approve the Pathway narration before selecting social clips." }, { status: 409 });
  if (!script.script_hash || script.script_hash !== audio.content_hash) return NextResponse.json({ error: "The approved narration changed after the audio was generated. Regenerate the audio first." }, { status: 409 });
  if (!verticalRender?.id || !verticalRender.output_url) return NextResponse.json({ error: "Render the 9:16 Pathway video before creating AI social cuts." }, { status: 409 });

  const current = (existingResult.data ?? []).filter((row) => row.source_render_id === verticalRender.id);
  if (!parsed.data.force && current.some((row) => row.status === "candidate" || row.status === "completed")) {
    return NextResponse.json({ clips: current, analyzed: false });
  }

  const audioResponse = await fetch(audio.audio_url, { cache: "no-store" });
  if (!audioResponse.ok) return NextResponse.json({ error: `Source audio could not be downloaded (${audioResponse.status}).` }, { status: 502 });
  const bytes = await audioResponse.arrayBuffer();
  if (!bytes.byteLength) return NextResponse.json({ error: "Source audio is empty." }, { status: 502 });

  const contentType = audioResponse.headers.get("content-type") || "audio/wav";
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: contentType }), audioFileName(contentType));
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
    const detail = (await transcriptionResponse.text().catch(() => "")).slice(0, 1000);
    return NextResponse.json({ error: `Social clip timing analysis failed (${transcriptionResponse.status}).`, detail }, { status: 502 });
  }

  const transcription = await transcriptionResponse.json() as WhisperVerboseResponse;
  const words = transcription.words ?? [];
  const tokens = transcriptTokens(words);
  if (!tokens.length) return NextResponse.json({ error: "The transcription returned no word timestamps." }, { status: 502 });
  const duration = typeof transcription.duration === "number" && transcription.duration > 0 ? transcription.duration : tokens.at(-1)?.end ?? 0;

  let candidates: Candidate[];
  try {
    candidates = await chooseCandidates({
      apiKey,
      model,
      title: pathway.title,
      summary: pathway.summary,
      script: script.script_text,
      scriptureFlow: pathway.steps.map((step) => `${step.reference} — ${step.title}`).join(" | "),
      duration
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "AI social clip selection failed." }, { status: 502 });
  }

  const resolved = candidates
    .map((candidate) => resolveCandidate(candidate, tokens, words, duration))
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  if (resolved.length < 2) {
    return NextResponse.json({ error: "AI found promising moments, but their exact narration anchors could not be timed reliably. Run the analysis again." }, { status: 502 });
  }

  const now = new Date().toISOString();
  await service.from("pathway_social_clips")
    .update({ status: "archived", updated_at: now })
    .eq("pathway_slug", pathway.slug)
    .neq("status", "completed");

  const inserted = await service.from("pathway_social_clips").insert(resolved.map((candidate, index) => ({
    pathway_slug: pathway.slug,
    source_render_id: verticalRender.id,
    platform: candidate.platform,
    rank: index + 1,
    score: candidate.score,
    start_seconds: candidate.startSeconds,
    end_seconds: candidate.endSeconds,
    hook: candidate.hook,
    title: candidate.title,
    rationale: candidate.rationale,
    caption: candidate.instagramCaption,
    status: "candidate",
    model,
    analysis_metadata: {
      version: 2,
      transcriptionModel,
      scriptHash: script.script_hash,
      audioContentHash: audio.content_hash,
      analyzedAt: now,
      startAnchor: candidate.startAnchor,
      endAnchor: candidate.endAnchor,
      durationSeconds: candidate.durationSeconds,
      captionCues: candidate.captionCues,
      socialPackage: {
        instagramCaption: candidate.instagramCaption,
        tiktokCaption: candidate.tiktokCaption,
        hashtags: candidate.hashtags,
        coverHeadline: candidate.coverHeadline,
        coverSubline: candidate.coverSubline,
        coverUrl: null
      }
    },
    created_by: access.user.id,
    updated_at: now
  }))).select("id,pathway_slug,source_render_id,platform,rank,score,start_seconds,end_seconds,hook,title,rationale,caption,status,output_url,error,model,analysis_metadata,created_at,completed_at");
  if (inserted.error) return NextResponse.json({ error: inserted.error.message }, { status: 500 });

  return NextResponse.json({ clips: inserted.data ?? [], analyzed: true });
}
