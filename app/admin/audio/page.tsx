import { redirect } from "next/navigation";
import { getStudioPermission } from "@/auth";
import { allPathways } from "@/pathway-catalog";
import { pathwayNarrationHash } from "@/pathway-audio";
import { PathwayAudioManager } from "@/pathway-audio-manager";
import { createServiceClient } from "@/supabase";

export default async function AdminPathwayAudioPage() {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed") redirect("/admin");

  const service = createServiceClient();
  const result = service
    ? await service.schema("content").from("pathway_audio_assets").select("pathway_slug,audio_url,content_hash,generated_at")
    : { data: [] as Array<{ pathway_slug: string; audio_url: string; content_hash: string; generated_at: string }>, error: null };
  const bySlug = new Map((result.data ?? []).map((row) => [String(row.pathway_slug), row]));

  const pathways = allPathways.map((pathway) => {
    const asset = bySlug.get(pathway.slug);
    return {
      slug: pathway.slug,
      title: pathway.title,
      estimatedMinutes: pathway.estimatedMinutes,
      audioUrl: asset?.audio_url ? String(asset.audio_url) : null,
      generatedAt: asset?.generated_at ? String(asset.generated_at) : null,
      current: Boolean(asset?.content_hash && String(asset.content_hash) === pathwayNarrationHash(pathway))
    };
  });

  return <PathwayAudioManager pathways={pathways}/>;
}
