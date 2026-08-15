import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { pathwayBySlug } from "@/pathway-catalog";
import { createServiceClient } from "@/supabase";
import { sourceTimeToOutputTime, type VideoProducerEditPlan } from "@/video-producer";
import { normalizeVideoProducerTranscript, transcriptForModel } from "@/video-producer-ai";
import {
  createPrivateBlobDownloadUrl,
  createPrivateBlobUploadUrl,
  createWorkerCallbackToken,
  dispatchVideoProducerWorker,
  extractOpenAIResponseText,
  videoProducerOpenAIKey,
  videoProducerRendererCredentials,
  videoProducerWorkerRef
} from "@/video-producer-server";

export const runtime = "nodejs";
export const maxDuration = 300;

const requestSchema = z.object({ projectId: z.string().uuid() });
const variants = ["face-hook", "doctrine", "pathway"] as const;
type ThumbnailVariant = typeof variants[number];

const THUMBNAIL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["candidates"],
  properties: {
    candidates: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["variant", "headline", "sourceTimestamp"],
        properties: {
          variant: { type: "string", enum: variants },
          headline: { type: "string" },
          sourceTimestamp: { type: "number" }
        }
      }
    }
  }
} as const;

function cleanHeadline(value: unknown) {
  return String(value || "").trim().replace(/\s+/g, " ").split(" ").slice(0, 6).join(" ").slice(0, 80);
}

export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid thumbnail request." }, { status: 400 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });
  const apiKey = videoProducerOpenAIKey();
  if (!apiKey) return NextResponse.json({ error: "VIDEO_PRODUCER_OPENAI_API_KEY is not configured." }, { status: 503 });

  const projectResult = await service.from("video_producer_projects")
    .select("id,title,mode,status,pathway_slug,source_provider,source_locator,source_duration,source_range_start,source_range_end,transcript,edit_plan")
    .eq("id", parsed.data.projectId).maybeSingle();
  if (projectResult.error) return NextResponse.json({ error: projectResult.error.message }, { status: 500 });
  const project = projectResult.data;
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  if (project.mode !== "podcast") return NextResponse.json({ error: "YouTube thumbnail candidates are generated for long-form Podcast projects." }, { status: 409 });
  if (!project.source_locator || project.source_provider !== "vercel_blob") return NextResponse.json({ error: "A private source video is required." }, { status: 409 });
  if (!project.edit_plan) return NextResponse.json({ error: "Run the Edit Director before generating thumbnails." }, { status: 409 });

  const transcript = normalizeVideoProducerTranscript(project.transcript);
  if (!transcript.text || !transcript.words.length) return NextResponse.json({ error: "A timestamped transcript is required." }, { status: 409 });
  const plan = project.edit_plan as VideoProducerEditPlan;
  const pathway = project.pathway_slug ? pathwayBySlug(project.pathway_slug) : null;
  const model = process.env.OPENAI_VIDEO_PRODUCER_MODEL?.trim() || process.env.OPENAI_VIDEO_DIRECTOR_MODEL?.trim() || "gpt-5.6-sol";
  const queuedRowIds: string[] = [];
  let batchId = "";

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model,
        reasoning: { effort: "medium" },
        text: { verbosity: "low", format: { type: "json_schema", name: "ag_youtube_thumbnail_candidates", strict: true, schema: THUMBNAIL_SCHEMA } },
        input: [
          { role: "developer", content: [{ type: "input_text", text: [
            "Create exactly three DISTINCT YouTube long-form thumbnail concepts for Apostolic Guide.",
            "Use only the supplied transcript and pathway. The thumbnail must accurately represent the video; never manufacture controversy, emotion, doctrine or a claim that is not present.",
            "YouTube thumbnails should be simple, readable at small sizes, and complement the title rather than repeat a full sentence.",
            "face-hook: 2-5 words, curiosity-forward but accurate; choose a source timestamp likely to show the speaker during an emphatic statement.",
            "doctrine: 2-5 words, a clear doctrinal statement actually supported by the transcript.",
            "pathway: 1-5 words, clean and branded around the pathway/central biblical question.",
            "The three concepts must differ materially in wording and intent so they are useful for YouTube thumbnail testing.",
            "sourceTimestamp must be a timestamp from the supplied source transcript, not output time."
          ].join("\n") }] },
          { role: "user", content: [{ type: "input_text", text: [
            `PROJECT TITLE: ${project.title}`,
            `PATHWAY: ${pathway?.title ?? "None selected"}`,
            pathway ? `PATHWAY SUMMARY: ${pathway.summary}` : "",
            `SOURCE DURATION: ${transcript.duration.toFixed(2)} seconds`,
            "TIMESTAMPED TRANSCRIPT:",
            transcriptForModel(transcript, 90000)
          ].filter(Boolean).join("\n\n") }] }
        ]
      })
    });
    if (!response.ok) throw new Error(`Thumbnail director failed (${response.status}): ${(await response.text().catch(() => "")).slice(0, 700)}`);
    const outputText = extractOpenAIResponseText(await response.json());
    if (!outputText) throw new Error("Thumbnail director returned no structured output.");
    const raw = JSON.parse(outputText) as { candidates?: Array<{ variant?: string; headline?: string; sourceTimestamp?: number }> };
    const byVariant = new Map<ThumbnailVariant, { headline: string; sourceTimestamp: number }>();
    for (const item of raw.candidates ?? []) {
      if (!variants.includes(item.variant as ThumbnailVariant)) continue;
      const variant = item.variant as ThumbnailVariant;
      const headline = cleanHeadline(item.headline);
      const sourceTimestamp = Math.max(0, Math.min(transcript.duration, Number(item.sourceTimestamp || 0)));
      if (headline) byVariant.set(variant, { headline, sourceTimestamp });
    }
    if (byVariant.size !== 3) throw new Error("Thumbnail director did not return all three required variants.");

    batchId = randomUUID();
    const callback = createWorkerCallbackToken();
    const sourceUrl = await createPrivateBlobDownloadUrl(project.source_locator, 3 * 60 * 60 * 1000);
    const workerVariants = [] as Array<{ id: string; variant: ThumbnailVariant; headline: string; sourceTimestamp: number; outputTimestamp: number; outputUploadUrl: string }>;

    for (const variant of variants) {
      const candidate = byVariant.get(variant)!;
      const outputTimestamp = sourceTimeToOutputTime(candidate.sourceTimestamp, plan.cuts, plan.sourceDuration) ?? 0;
      const rowId = randomUUID();
      const storagePath = `video-producer/thumbnails/${project.id}/${batchId}-${variant}.jpg`;
      const outputUploadUrl = await createPrivateBlobUploadUrl({ pathname: storagePath, contentType: "image/jpeg", maxBytes: 12 * 1024 * 1024, ttlMs: 3 * 60 * 60 * 1000 });
      const upsert = await service.from("video_producer_thumbnails").upsert({
        id: rowId,
        project_id: project.id,
        variant,
        headline: candidate.headline,
        timestamp_seconds: candidate.sourceTimestamp,
        status: "queued",
        storage_locator: storagePath,
        error: null,
        callback_token_hash: callback.hash,
        created_by: access.user.id,
        created_at: new Date().toISOString(),
        completed_at: null
      }, { onConflict: "project_id,variant" }).select("id").single();
      if (upsert.error) throw new Error(upsert.error.message);
      queuedRowIds.push(upsert.data.id);
      workerVariants.push({ id: upsert.data.id, variant, headline: candidate.headline, sourceTimestamp: candidate.sourceTimestamp, outputTimestamp, outputUploadUrl });
    }

    const { token, repository } = await videoProducerRendererCredentials(service);
    if (!token) throw new Error("Video worker is not connected.");
    const workerRef = videoProducerWorkerRef();
    await dispatchVideoProducerWorker({
      token,
      repository,
      eventType: "video-producer-thumbnail",
      payload: {
        job_id: batchId,
        project_id: project.id,
        worker_ref: workerRef,
        source_url: sourceUrl,
        source_range_start: project.source_range_start,
        source_range_end: project.source_range_end,
        project_title: project.title,
        pathway_title: pathway?.title ?? "Apostolic Guide",
        variants: workerVariants,
        callback_url: `${new URL(request.url).origin}/api/admin/video-producer/thumbnails/callback`,
        callback_token: callback.token
      }
    });
    const started = await service.from("video_producer_thumbnails").update({ status: "rendering", error: null }).in("id", queuedRowIds);
    if (started.error) console.error("Video Producer thumbnail status update failed", { projectId: project.id, batchId, message: started.error.message });
    return NextResponse.json({ ok: true, variants: workerVariants.map(({ outputUploadUrl: _url, ...item }) => item) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Thumbnail generation failed.";
    console.error("Video Producer thumbnail generation failed", { projectId: project.id, batchId: batchId || null, queued: queuedRowIds.length, message });
    if (queuedRowIds.length) {
      const failed = await service.from("video_producer_thumbnails").update({
        status: "failed",
        error: message,
        callback_token_hash: null,
        completed_at: new Date().toISOString()
      }).in("id", queuedRowIds);
      if (failed.error) console.error("Video Producer thumbnail failure-state update failed", { projectId: project.id, message: failed.error.message });
    }
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
