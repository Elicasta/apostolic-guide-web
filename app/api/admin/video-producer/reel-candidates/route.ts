import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";
import {
  normalizeVideoProducerReelCandidates,
  normalizeVideoProducerTranscript,
  transcriptForModel,
  VIDEO_PRODUCER_CANDIDATES_JSON_SCHEMA
} from "@/video-producer-ai";
import { extractOpenAIResponseText, videoProducerOpenAIKey } from "@/video-producer-server";

export const runtime = "nodejs";
export const maxDuration = 300;

const schema = z.object({ projectId: z.string().uuid() });

export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid reel candidate request." }, { status: 400 });
  const apiKey = videoProducerOpenAIKey();
  if (!apiKey) return NextResponse.json({ error: "VIDEO_PRODUCER_OPENAI_API_KEY is not configured." }, { status: 503 });
  const model = process.env.OPENAI_SOCIAL_CLIP_MODEL?.trim() || process.env.OPENAI_VIDEO_PRODUCER_MODEL?.trim() || "gpt-5.6-sol";
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });

  const projectResult = await service.from("video_producer_projects")
    .select("id,title,mode,status,transcript,director_metadata")
    .eq("id", parsed.data.projectId)
    .maybeSingle();
  if (projectResult.error) return NextResponse.json({ error: projectResult.error.message }, { status: 500 });
  const project = projectResult.data;
  if (!project || project.mode !== "podcast") return NextResponse.json({ error: "Choose a Podcast Mode project." }, { status: 404 });
  if (!["approved","rendering","review","completed"].includes(project.status)) return NextResponse.json({ error: "Approve the podcast edit before extracting reels." }, { status: 409 });
  const transcript = normalizeVideoProducerTranscript(project.transcript);
  if (!transcript.words.length || !transcript.text) return NextResponse.json({ error: "Podcast transcript is missing." }, { status: 409 });

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model,
        reasoning: { effort: "medium" },
        text: {
          verbosity: "low",
          format: { type: "json_schema", name: "ag_video_producer_reel_candidates", strict: true, schema: VIDEO_PRODUCER_CANDIDATES_JSON_SCHEMA }
        },
        input: [
          { role: "developer", content: [{ type: "input_text", text: [
            "You select short-form candidates from an approved Apostolic Guide podcast transcript.",
            "Return 5 to 15 self-contained moments. Every start/end timestamp must correspond to the supplied transcript.",
            "Prefer moments that make a complete claim, answer a real question, explain Scripture clearly, or create curiosity without misleading context.",
            "Do not manufacture hooks, rearrange words, or score a clip highly merely because it is controversial.",
            "Typical target is 25 to 75 seconds. 12 to 150 seconds is the hard accepted range.",
            "Avoid heavily overlapping candidates. A score is editorial ranking, not a promise of virality.",
            "The title and hook describe what is actually spoken."
          ].join("\n") }] },
          { role: "user", content: [{ type: "input_text", text: [
            `PODCAST: ${project.title}`,
            `DURATION: ${transcript.duration.toFixed(2)} seconds`,
            "TIMESTAMPED TRANSCRIPT:",
            transcriptForModel(transcript)
          ].join("\n\n") }] }
        ]
      })
    });
    if (!response.ok) throw new Error(`Reel selector failed (${response.status}): ${(await response.text().catch(() => "")).slice(0, 900)}`);
    const result = await response.json();
    const output = extractOpenAIResponseText(result);
    if (!output) throw new Error("Reel selector returned no structured output.");
    const candidates = normalizeVideoProducerReelCandidates(JSON.parse(output), transcript.duration);
    if (!candidates.length) throw new Error("No usable reel candidates survived timing validation.");
    const now = new Date().toISOString();
    const metadata = project.director_metadata && typeof project.director_metadata === "object" ? project.director_metadata as Record<string, unknown> : {};
    const update = await service.from("video_producer_projects").update({
      reel_candidates: candidates,
      director_metadata: { ...metadata, reelSelection: { model, generatedAt: now, count: candidates.length } },
      updated_by: access.user.id
    }).eq("id", project.id);
    if (update.error) throw new Error(update.error.message);
    return NextResponse.json({ candidates });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Reel candidate generation failed." }, { status: 502 });
  }
}
