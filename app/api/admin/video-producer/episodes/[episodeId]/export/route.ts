import { NextResponse } from "next/server";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";

function safeEpisodeFilename(title: string) {
  const stem = title.normalize("NFKD").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(0, 120) || "episode";
  return `${stem}.wav`;
}
function estimateDurationSeconds(script: string) {
  const words = script.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round((words / 145) * 60));
}
function episodeTranscript(script: string, duration: number) {
  return { text: script, duration, words: [], segments: [{ text: script, start: 0, end: duration }] };
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
  const duration = estimateDurationSeconds(script);
  const transcript = episodeTranscript(script, duration);
  const projectPatch = {
    source_provider: "episode-studio",
    source_locator: episode.audio_storage_path || episode.audio_url,
    source_filename: safeEpisodeFilename(episode.title),
    source_duration: duration,
    transcript_text: script,
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
