import { NextResponse } from "next/server";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";

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

  if (episode.exported_project_id) return NextResponse.json({ projectId: episode.exported_project_id, reused: true });

  const created = await service.from("video_producer_projects").insert({
    title: episode.title,
    mode: "podcast",
    pathway_slug: episode.primary_pathway_slug,
    status: "draft",
    director_metadata: {
      episodeScriptId: episode.id,
      sourceKind: "episode-script",
      premise: episode.premise,
      supportingPathwaySlugs: episode.supporting_pathway_slugs,
      episodeFormat: episode.format,
      speakers: episode.speakers,
      approvedScript: episode.script_text,
      theologyReview: episode.theology_review,
      handedOffAt: new Date().toISOString()
    },
    created_by: access.user.id,
    updated_by: access.user.id
  }).select("id").single();
  if (created.error) return NextResponse.json({ error: created.error.message }, { status: 500 });

  const saved = await service.from("video_producer_episode_scripts").update({
    status: "exported",
    exported_project_id: created.data.id,
    updated_by: access.user.id
  }).eq("id", episodeId);
  if (saved.error) return NextResponse.json({ error: saved.error.message }, { status: 500 });
  return NextResponse.json({ projectId: created.data.id, reused: false });
}
