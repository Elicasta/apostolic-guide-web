import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { pathwayBySlug } from "../../pathway-catalog";
import { alignPathwayVideoTimeline, type TimedTranscriptWord } from "../../pathway-video-alignment";
import { normalizeDirectedPathwayVideoCues, PATHWAY_VIDEO_DIRECTOR_SCHEMA, type DirectedPathwayVideoCue } from "../../pathway-video-director";
import { normalizePathwayVideoPublishingMetadata, PATHWAY_VIDEO_PUBLISHING_JSON_SCHEMA } from "../../pathway-video-publishing";
import type { SolTool, SolToolContext } from "../../sol-core/tools/types";
import { createServiceClient } from "../../supabase";

const inputSchema = z.object({ slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), forceAnalysis: z.boolean().default(false), queueRender: z.boolean().default(true) });
const outputSchema = z.object({
  slug: z.string(), projectId: z.string().uuid(), analyzed: z.boolean(), publishingKitReady: z.boolean(), renderIds: z.array(z.string().uuid()), renderStates: z.array(z.string()), publishingBlocked: z.literal(true),
  artifacts: z.array(z.object({ type: z.string(), title: z.string(), storageType: z.literal("database"), location: z.string(), metadata: z.record(z.string(), z.unknown()), verificationStatus: z.enum(["pending","passed","failed"]) }))
});

type WhisperVerboseResponse = { duration?: number; text?: string; words?: Array<{ word?: string; start?: number; end?: number }> };

function service() {
  const client = createServiceClient();
  if (!client) throw new Error("Supabase service access is not configured.");
  return client;
}
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
async function openAiJson(input: { apiKey: string; model: string; name: string; schema: Record<string, unknown>; instructions: string; prompt: string }, signal: AbortSignal) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${input.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ model: input.model, reasoning: { effort: "medium" }, text: { verbosity: "medium", format: { type: "json_schema", name: input.name, strict: true, schema: input.schema } }, input: [{ role: "developer", content: [{ type: "input_text", text: input.instructions }] }, { role: "user", content: [{ type: "input_text", text: input.prompt }] }] }),
    signal
  });
  if (!response.ok) throw new Error(`OpenAI ${input.name} failed (${response.status}): ${(await response.text().catch(() => "")).slice(0, 1000)}`);
  const payload = await response.json();
  const text = extractResponseText(payload);
  if (!text) throw new Error(`${input.name} returned no structured output.`);
  return JSON.parse(text) as unknown;
}

async function directTalkingPoints(input: { apiKey: string; model: string; title: string; summary: string; script: string; scriptureFlow: string; duration: number; scriptureCount: number; signal: AbortSignal }): Promise<DirectedPathwayVideoCue[]> {
  const targetTotal = Math.max(16, Math.min(22, Math.round(input.duration / 16)));
  const fixedCueCount = input.scriptureCount + 2;
  const requested = Math.max(6, Math.min(16, targetTotal - fixedCueCount));
  const decoded = await openAiJson({
    apiKey: input.apiKey,
    model: input.model,
    name: "apostolic_guide_video_director",
    schema: PATHWAY_VIDEO_DIRECTOR_SCHEMA as unknown as Record<string, unknown>,
    instructions: [
      "You are directing an audio-first Apostolic Guide Scripture video.",
      "The approved narration is the theological source of truth. Do not add doctrine, history, illustrations, or conclusions not in it.",
      `Create exactly ${requested} additional visual talking-point cues. Scripture cards are added separately by software.`,
      "Return one QUESTION near the opening, several STATEMENT cues through the teaching, and one RECAP near the conclusion.",
      "Every anchorText must be an exact contiguous phrase from the approved narration. Prefer 4 to 12 words.",
      "Titles should be 2 to 8 words. Bodies should be one short supporting line. Avoid generic filler headings."
    ].join("\n"),
    prompt: `PATHWAY: ${input.title}\nSUMMARY: ${input.summary}\nDURATION: ${input.duration.toFixed(2)} seconds\nSCRIPTURE FLOW: ${input.scriptureFlow}\n\nAPPROVED NARRATION:\n${input.script}`
  }, input.signal);
  return normalizeDirectedPathwayVideoCues(decoded);
}

async function rendererCredentials(client: ReturnType<typeof createServiceClient>) {
  let token = process.env.VIDEO_STUDIO_GITHUB_TOKEN?.trim() || "";
  let repository = process.env.VIDEO_STUDIO_GITHUB_REPOSITORY?.trim() || "Elicasta/apostolic-guide-web";
  if (token || !client) return { token, repository };
  const { data, error } = await client.schema("analytics").from("integration_secrets").select("name,secret").in("name", ["video_studio_github_token", "video_studio_github_repository"]);
  if (error) throw new Error(error.message);
  const values = new Map((data ?? []).map((row) => [row.name, row.secret]));
  token = values.get("video_studio_github_token")?.trim() || "";
  repository = values.get("video_studio_github_repository")?.trim() || repository;
  return { token, repository };
}

function callbackOrigin() {
  const explicit = process.env.APOSTOLIC_GUIDE_ORIGIN?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  return "https://www.apostolicguide.com";
}

export const apostolicAudioToYoutubeTool: SolTool<z.infer<typeof inputSchema>, z.infer<typeof outputSchema>> = {
  name: "apostolic.video.audioToYoutube",
  description: "Validate approved Pathway audio, build or reuse its timed video project, create the publishing kit, and queue a YouTube render without publishing.",
  inputSchema,
  outputSchema,
  permissions: ["write"],
  supportedEnvironments: ["development", "preview", "production"],
  idempotency: "required",
  async execute(input, context: SolToolContext) {
    try {
      const pathway = pathwayBySlug(input.slug);
      if (!pathway) throw new Error("Pathway not found.");
      const client = service();
      const apiKey = process.env.OPENAI_API_KEY?.trim();
      if (!apiKey) throw Object.assign(new Error("OPENAI_API_KEY is not configured."), { code: "AUTH_REQUIRED" });
      const transcriptionModel = process.env.OPENAI_VIDEO_TRANSCRIBE_MODEL?.trim() || "whisper-1";
      if (transcriptionModel !== "whisper-1") throw new Error("Video Studio word timing requires OPENAI_VIDEO_TRANSCRIBE_MODEL=whisper-1.");
      const directorModel = process.env.OPENAI_VIDEO_DIRECTOR_MODEL?.trim() || "gpt-5.6-sol";
      const publishingModel = process.env.OPENAI_VIDEO_PUBLISHING_MODEL?.trim() || "gpt-5.6-sol";

      const [assetResult, scriptResult, projectResult] = await Promise.all([
        client.from("pathway_audio_assets").select("audio_url,content_hash").eq("pathway_slug", pathway.slug).maybeSingle(),
        client.from("pathway_audio_scripts").select("script_text,script_hash,status,checker_status,checked_script_hash").eq("pathway_slug", pathway.slug).maybeSingle(),
        client.from("pathway_video_projects").select("id,audio_content_hash,timeline,style,updated_at").eq("pathway_slug", pathway.slug).maybeSingle()
      ]);
      if (assetResult.error) throw assetResult.error; if (scriptResult.error) throw scriptResult.error; if (projectResult.error) throw projectResult.error;
      const asset = assetResult.data; const script = scriptResult.data;
      if (!asset?.audio_url || !asset.content_hash) throw new Error("Approved Pathway audio is missing.");
      if (!script?.script_text || !script.script_hash || script.status !== "approved") throw new Error("Approved Pathway narration is missing.");
      if (script.checker_status !== "passed" || script.checked_script_hash !== script.script_hash) throw new Error("The exact approved script has not passed the theology checker.");
      if (asset.content_hash !== script.script_hash) throw new Error("The audio does not match the approved script. Regenerate it first.");
      await context.emit("source.verified", "Approved script, theology verdict, and audio hash match.", { slug: pathway.slug, scriptHash: script.script_hash });

      let project = projectResult.data;
      let analyzed = false;
      const existingStyle = project?.style && typeof project.style === "object" ? project.style as Record<string, unknown> : {};
      const existingAlignment = existingStyle.alignment && typeof existingStyle.alignment === "object" ? existingStyle.alignment as Record<string, unknown> : null;
      const canReuse = !input.forceAnalysis && project && project.audio_content_hash === asset.content_hash && existingAlignment?.status === "aligned-rich" && existingAlignment?.scriptHash === script.script_hash && Array.isArray(project.timeline) && project.timeline.length >= 12;
      if (!canReuse) {
        const audioResponse = await fetch(asset.audio_url, { cache: "no-store", signal: context.signal });
        if (!audioResponse.ok) throw new Error(`Source audio could not be downloaded (${audioResponse.status}).`);
        const audioBytes = await audioResponse.arrayBuffer();
        if (!audioBytes.byteLength) throw new Error("Source audio is empty.");
        const contentType = audioResponse.headers.get("content-type") || "audio/wav";
        const form = new FormData();
        form.append("file", new Blob([audioBytes], { type: contentType }), audioFileName(contentType));
        form.append("model", transcriptionModel);
        form.append("language", "en");
        form.append("response_format", "verbose_json");
        form.append("timestamp_granularities[]", "word");
        form.append("temperature", "0");
        form.append("prompt", [pathway.title, ...pathway.steps.map((step) => step.reference)].join(", ").slice(0, 900));
        const transcriptionResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { authorization: `Bearer ${apiKey}` }, body: form, signal: context.signal });
        if (!transcriptionResponse.ok) throw new Error(`Audio timing analysis failed (${transcriptionResponse.status}): ${(await transcriptionResponse.text().catch(() => "")).slice(0, 800)}`);
        const transcription = await transcriptionResponse.json() as WhisperVerboseResponse;
        const words: TimedTranscriptWord[] = (transcription.words ?? []).flatMap((word) => typeof word.word === "string" && typeof word.start === "number" && typeof word.end === "number" ? [{ word: word.word, start: word.start, end: word.end }] : []);
        if (!words.length) throw new Error("The transcription returned no word timestamps.");
        const duration = typeof transcription.duration === "number" && transcription.duration > 0 ? transcription.duration : (words.at(-1)?.end ?? 0);
        let directedCues: DirectedPathwayVideoCue[] = [];
        let directorError: string | null = null;
        try { directedCues = await directTalkingPoints({ apiKey, model: directorModel, title: pathway.title, summary: pathway.summary, script: script.script_text, scriptureFlow: pathway.steps.map((step) => `${step.reference} — ${step.title}`).join(" | "), duration, scriptureCount: pathway.steps.length, signal: context.signal }); }
        catch (error) { directorError = error instanceof Error ? error.message : "Video director failed."; }
        const alignment = alignPathwayVideoTimeline({ source: pathway, scriptText: script.script_text, transcriptWords: words, duration, directedCues });
        const analyzedAt = new Date().toISOString();
        const style = { ...existingStyle, brandVersion: 2, template: "audio-first-rich-v1", alignment: { status: "aligned-rich", method: directedCues.length ? "gpt-directed-approved-script-word-alignment" : "approved-script-word-alignment-rich-fallback", transcriptionModel, directorModel: directedCues.length ? directorModel : null, directorError, scriptHash: script.script_hash, audioContentHash: asset.content_hash, analyzedAt, confidence: alignment.confidence, alignmentCoverage: alignment.alignmentCoverage, matchedScriptureCues: alignment.matchedScriptureCues, totalScriptureCues: alignment.totalScriptureCues, matchedDirectedCues: alignment.matchedDirectedCues, totalDirectedCues: alignment.totalDirectedCues, totalVideoCues: alignment.totalVideoCues } };
        const saved = await client.from("pathway_video_projects").upsert({ pathway_slug: pathway.slug, audio_content_hash: asset.content_hash, timeline: alignment.timeline, style, updated_by: null, updated_at: analyzedAt, created_by: null }, { onConflict: "pathway_slug" }).select("id,audio_content_hash,timeline,style,updated_at").single();
        if (saved.error) throw saved.error;
        project = saved.data;
        analyzed = true;
        await context.emit("video.analyzed", "Timed video project created from approved narration.", { transcriptWordCount: words.length, directorFallback: !directedCues.length });
      } else {
        await context.emit("video.reused", "Existing aligned video project reused.", { projectId: project?.id });
      }
      if (!project?.id) throw new Error("Video project could not be prepared.");

      const publishingDecoded = await openAiJson({
        apiKey,
        model: publishingModel,
        name: "apostolic_guide_video_publishing_kit",
        schema: PATHWAY_VIDEO_PUBLISHING_JSON_SCHEMA as unknown as Record<string, unknown>,
        instructions: [
          "You are the publishing strategist for Apostolic Guide.",
          "Create accurate distribution copy for a Scripture-first Apostolic Christian teaching video.",
          "The approved narration is the theological source of truth. Do not add doctrine, history, promises, controversy, or sensational language not supported by it.",
          "Optimize for clarity and genuine search intent without clickbait.",
          "Thumbnail text should be 2 to 5 words when possible. Thumbnail image prompts are background only with no words, letters, logos, UI, watermarks, fake Scripture text, or typography."
        ].join("\n"),
        prompt: `PATHWAY: ${pathway.title}\nSUMMARY: ${pathway.summary}\nDESTINATION: https://www.apostolicguide.com/pathways/${pathway.slug}\nSCRIPTURE FLOW: ${pathway.steps.map((step) => `${step.reference} — ${step.title}`).join(" | ")}\n\nAPPROVED NARRATION:\n${script.script_text}`
      }, context.signal);
      const metadata = normalizePathwayVideoPublishingMetadata(publishingDecoded);
      const existingKit = await client.from("pathway_video_publishing_kits").select("thumbnail_background_url,thumbnail_storage_path,image_model,image_quality").eq("pathway_slug", pathway.slug).maybeSingle();
      if (existingKit.error) throw existingKit.error;
      const kitSaved = await client.from("pathway_video_publishing_kits").upsert({ pathway_slug: pathway.slug, audio_content_hash: asset.content_hash, metadata, thumbnail_background_url: existingKit.data?.thumbnail_background_url ?? null, thumbnail_storage_path: existingKit.data?.thumbnail_storage_path ?? null, text_model: publishingModel, image_model: existingKit.data?.image_model ?? null, image_quality: existingKit.data?.image_quality ?? null, created_by: null, updated_by: null, updated_at: new Date().toISOString() }, { onConflict: "pathway_slug" }).select("pathway_slug").single();
      if (kitSaved.error) throw kitSaved.error;
      await context.emit("publishing_kit.completed", "YouTube publishing kit created and saved.", { model: publishingModel });

      const existingRender = await client.from("pathway_video_renders").select("id,status,output_url").eq("pathway_slug", pathway.slug).eq("format", "youtube").in("status", ["queued","rendering","completed"]).order("requested_at", { ascending: false }).limit(1).maybeSingle();
      if (existingRender.error) throw existingRender.error;
      let renderRows = existingRender.data ? [existingRender.data] : [];
      if (!renderRows.length && input.queueRender) {
        const credentials = await rendererCredentials(client);
        if (!credentials.token) throw Object.assign(new Error("Video renderer is not connected."), { code: "AUTH_REQUIRED" });
        const publishingAsset = await client.from("pathway_assets").insert({ pathway_slug: pathway.slug, type: "youtube", title: `${pathway.title} · YouTube`, language: "en", status: "in_production", platform: "youtube", source_url: asset.audio_url, cta_type: "visit_pathway", destination_url: `https://www.apostolicguide.com/pathways/${pathway.slug}`, notes: `Generated by SOL Runtime from Pathway audio ${asset.content_hash}.` }).select("id").single();
        if (publishingAsset.error) throw publishingAsset.error;
        const snapshot = { version: 2, pathway: { slug: pathway.slug, title: pathway.title, summary: pathway.summary }, format: "youtube", audioUrl: asset.audio_url, audioContentHash: asset.content_hash, timeline: project.timeline, style: project.style, assetId: publishingAsset.data.id, replaceExisting: false };
        const created = await client.from("pathway_video_renders").insert({ pathway_slug: pathway.slug, project_id: project.id, asset_id: publishingAsset.data.id, format: "youtube", status: "queued", config_snapshot: snapshot, requested_by: null }).select("id,status,output_url").single();
        if (created.error) throw created.error;
        const storagePath = `pathways/${pathway.slug}/${created.data.id}-youtube.mp4`;
        const callbackToken = randomBytes(32).toString("hex");
        const callbackTokenHash = createHash("sha256").update(callbackToken).digest("hex");
        const signedUpload = await client.storage.from("pathway-video").createSignedUploadUrl(storagePath, { upsert: true });
        if (signedUpload.error || !signedUpload.data?.signedUrl) throw new Error(`Could not create signed render upload URL: ${signedUpload.error?.message ?? "unknown storage error"}`);
        const publicUrl = client.storage.from("pathway-video").getPublicUrl(storagePath).data.publicUrl;
        const bridgeSnapshot = { ...snapshot, rendererBridge: { callbackTokenHash, storagePath, publicUrl } };
        const bridge = await client.from("pathway_video_renders").update({ config_snapshot: bridgeSnapshot }).eq("id", created.data.id);
        if (bridge.error) throw bridge.error;
        const callbackUrl = `${callbackOrigin()}/api/admin/video-studio/render-callback`;
        const dispatch = await fetch(`https://api.github.com/repos/${credentials.repository}/dispatches`, { method: "POST", headers: { accept: "application/vnd.github+json", authorization: `Bearer ${credentials.token}`, "content-type": "application/json", "user-agent": "apostolic-guide-sol-runtime", "x-github-api-version": "2022-11-28" }, body: JSON.stringify({ event_type: "pathway-video-render", client_payload: { job_id: created.data.id, slug: pathway.slug, title: pathway.title, format: "youtube", audio_url: asset.audio_url, timeline: project.timeline, style: project.style, upload_url: signedUpload.data.signedUrl, callback_url: callbackUrl, callback_token: callbackToken } }), signal: context.signal });
        if (!dispatch.ok) {
          const detail = (await dispatch.text().catch(() => "")).slice(0, 800);
          const message = `Renderer dispatch failed (${dispatch.status})${detail ? `: ${detail}` : ""}`;
          await Promise.all([client.from("pathway_video_renders").update({ status: "failed", error: message, completed_at: new Date().toISOString() }).eq("id", created.data.id), client.from("pathway_assets").update({ status: "blocked", notes: message }).eq("id", publishingAsset.data.id)]);
          throw new Error(message);
        }
        renderRows = [created.data];
        await context.emit("render.queued", "YouTube render queued through GitHub renderer.", { renderId: created.data.id });
      }

      const renderIds = renderRows.map((row) => String(row.id));
      const renderStates = renderRows.map((row) => String(row.status));
      const location = `/admin/video-studio?pathway=${encodeURIComponent(pathway.slug)}`;
      return { ok: true, data: { slug: pathway.slug, projectId: String(project.id), analyzed, publishingKitReady: true, renderIds, renderStates, publishingBlocked: true, artifacts: [{ type: "youtube_preparation_package", title: `${pathway.title} YouTube package`, storageType: "database", location, metadata: { projectId: project.id, renderIds, renderStates, publishingBlocked: true }, verificationStatus: "passed" }] }, observations: { analyzed, renderCount: renderIds.length, publishingBlocked: true, aiDecisions: analyzed ? 2 : 1 } };
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code || "VIDEO_PRODUCTION_FAILED") : "VIDEO_PRODUCTION_FAILED";
      const message = error instanceof Error ? error.message : "Audio-to-YouTube production failed.";
      return { ok: false, error: { code, message, retryable: /429|timeout|network|5\d\d/i.test(message) } };
    }
  }
};
