import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

function safeEpisodeFilename(title: string) {
  const stem = title.normalize("NFKD").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(0, 120) || "episode";
  return `${stem}.wav`;
}
function estimateDurationSeconds(script: string) {
  const words = script.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, (words / 145) * 60);
}
function wavDurationSeconds(audio: Buffer) {
  if (audio.length < 44 || audio.toString("ascii", 0, 4) !== "RIFF" || audio.toString("ascii", 8, 12) !== "WAVE") return null;
  let offset = 12;
  let byteRate = 0;
  let dataSize = 0;
  while (offset + 8 <= audio.length) {
    const id = audio.toString("ascii", offset, offset + 4);
    const size = audio.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (id === "fmt " && size >= 12 && start + 12 <= audio.length) byteRate = audio.readUInt32LE(start + 8);
    if (id === "data") { dataSize = Math.min(size, Math.max(0, audio.length - start)); break; }
    offset = start + size + (size % 2);
  }
  return byteRate > 0 && dataSize > 0 ? dataSize / byteRate : null;
}
function spokenText(script: string) {
  return script
    .replace(/^\s*[^:\n]{1,60}:\s*/gm, "")
    .replace(/^\s*\[[^\]]+\]\s*$/gm, "")
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/[*_`]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
function episodeTranscript(script: string, duration: number) {
  const text = spokenText(script) || script.trim();
  const tokens = text.split(/\s+/).filter(Boolean);
  const step = duration / Math.max(1, tokens.length);
  const words = tokens.map((word, index) => ({
    word,
    start: Math.max(0, index * step),
    end: Math.min(duration, (index + 1) * step)
  }));
  return { text, duration, words, segments: [{ text, start: 0, end: duration }] };
}
async function ensureRenderableAudio(episode: Record<string, unknown>) {
  const audioUrl = String(episode.audio_url || "").trim();
  if (!audioUrl) throw new Error("Episode audio is missing.");
  const response = await fetch(audioUrl, { cache: "no-store" });
  if (!response.ok) throw new Error(`Episode audio could not be read (${response.status}).`);
  const audio = Buffer.from(await response.arrayBuffer());
  if (!audio.length) throw new Error("Episode audio is empty.");
  const hash = String(episode.audio_content_hash || "audio").slice(0, 24).replace(/[^a-zA-Z0-9_-]/g, "") || "audio";
  const pathname = `video-producer/sources/episodes/${String(episode.id)}/${hash}.wav`;
  const blob = await put(pathname, audio, {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "audio/wav"
  });
  return { pathname: blob.pathname, duration: wavDurationSeconds(audio) };
}

export async function POST(_request: Request, context: { params: Promise<{ episodeId: string }> }) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { episodeId } = await context.params;
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });
  const result = await service.from("video_producer_episode_scripts").select("*").eq("id", episodeId).maybeSingle();
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
  if (!result.data) return NextResponse.json({ error: "Episode was not found." }, { status: 404 });
  const episode = result.data;
  if (episode.status !== "approved" && episode.status !== "exported") return NextResponse.json({ error: "Approve the episode after theology review before sending it to Video Producer." }, { status: 409 });
  if (!episode.audio_url) return NextResponse.json({ error: "Generate the approved Episode Studio audio before creating the video production project." }, { status: 409 });
  const script = String(episode.script_text || "").trim();
  if (!script) return NextResponse.json({ error: "The approved Episode script is empty." }, { status: 409 });

  let source: { pathname: string; duration: number | null };
  try {
    source = await ensureRenderableAudio(episode as Record<string, unknown>);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Episode audio could not be prepared for Video Producer." }, { status: 502 });
  }

  const duration = source.duration && Number.isFinite(source.duration) ? source.duration : estimateDurationSeconds(script);
  const transcript = episodeTranscript(script, duration);
  const projectPatch = {
    source_provider: "vercel_blob",
    source_locator: source.pathname,
    source_filename: safeEpisodeFilename(episode.title),
    source_duration: duration,
    transcript_text: transcript.text,
    transcript,
    pathway_slug: episode.primary_pathway_slug,
    updated_by: access.user.id,
    updated_at: new Date().toISOString()
  };

  if (episode.exported_project_id) {
    const existing = await service.from("video_producer_projects").update(projectPatch).eq("id", episode.exported_project_id).select("id").maybeSingle();
    if (existing.error) return NextResponse.json({ error: existing.error.message }, { status: 500 });
    if (existing.data) return NextResponse.json({ projectId: existing.data.id, reused: true, recommendedStep: "produce" });
  }

  const created = await service.from("video_producer_projects").insert({
    title: episode.title,
    mode: "podcast",
    status: "uploaded",
    ...projectPatch,
    director_metadata: {
      episodeScriptId: episode.id,
      sourceKind: "episode-studio",
      premise: episode.premise,
      supportingPathwaySlugs: episode.supporting_pathway_slugs,
      episodeFormat: episode.format,
      speakers: episode.speakers,
      approvedScript: script,
      theologyReview: episode.theology_review,
      episodeAudioUrl: episode.audio_url,
      episodeAudioStoragePath: episode.audio_storage_path ?? null,
      episodeAudioContentHash: episode.audio_content_hash ?? null,
      episodeAudioModel: episode.audio_model ?? null,
      episodeAudioVoiceMap: episode.audio_voice_map ?? {},
      episodeAudioGeneratedAt: episode.audio_generated_at ?? null,
      handedOffAt: new Date().toISOString()
    },
    created_by: access.user.id
  }).select("id").single();
  if (created.error) return NextResponse.json({ error: created.error.message }, { status: 500 });

  const saved = await service.from("video_producer_episode_scripts").update({ status: "exported", exported_project_id: created.data.id, updated_by: access.user.id }).eq("id", episodeId);
  if (saved.error) return NextResponse.json({ error: saved.error.message }, { status: 500 });
  return NextResponse.json({ projectId: created.data.id, reused: false, recommendedStep: "produce" });
}
