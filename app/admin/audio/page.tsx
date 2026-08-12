import { redirect } from "next/navigation";
import { getStudioPermission } from "@/auth";
import { allPathways } from "@/pathway-catalog";
import { pathwayNarrationHash } from "@/pathway-audio";
import { PathwayAudioManager } from "@/pathway-audio-manager";
import { createServiceClient } from "@/supabase";

type AudioEvent = {
  event_name: string;
  properties: Record<string, unknown>;
  anonymous_id: string;
  session_id: string;
};

export default async function AdminPathwayAudioPage() {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed") redirect("/admin");

  const service = createServiceClient();
  const [assetsResult, eventsResult] = service ? await Promise.all([
    service.schema("content").from("pathway_audio_assets").select("pathway_slug,audio_url,content_hash,generated_at"),
    service.schema("analytics").from("events").select("event_name,properties,anonymous_id,session_id").in("event_name", ["audio_started", "audio_progress", "audio_completed"]).order("occurred_at", { ascending: false }).limit(10000)
  ]) : [
    { data: [] as Array<{ pathway_slug: string; audio_url: string; content_hash: string; generated_at: string }> },
    { data: [] as AudioEvent[] }
  ];

  const bySlug = new Map((assetsResult.data ?? []).map((row) => [String(row.pathway_slug), row]));
  const events = (eventsResult.data ?? []) as AudioEvent[];
  const stats = new Map<string, { starts: number; completions: number; listenedSeconds: number; listeners: Set<string> }>();

  for (const event of events) {
    const slug = typeof event.properties?.pathwaySlug === "string" ? event.properties.pathwaySlug : "";
    if (!slug) continue;
    const row = stats.get(slug) ?? { starts: 0, completions: 0, listenedSeconds: 0, listeners: new Set<string>() };
    if (event.event_name === "audio_started") row.starts += 1;
    if (event.event_name === "audio_completed") row.completions += 1;
    if (event.event_name === "audio_progress") {
      const delta = Number(event.properties?.deltaListenedSeconds ?? 0);
      if (Number.isFinite(delta) && delta > 0 && delta < 300) row.listenedSeconds += delta;
    }
    row.listeners.add(event.anonymous_id || event.session_id);
    stats.set(slug, row);
  }

  const pathways = allPathways.map((pathway) => {
    const asset = bySlug.get(pathway.slug);
    const metric = stats.get(pathway.slug);
    return {
      slug: pathway.slug,
      title: pathway.title,
      estimatedMinutes: pathway.estimatedMinutes,
      audioUrl: asset?.audio_url ? String(asset.audio_url) : null,
      generatedAt: asset?.generated_at ? String(asset.generated_at) : null,
      current: Boolean(asset?.content_hash && String(asset.content_hash) === pathwayNarrationHash(pathway)),
      starts: metric?.starts ?? 0,
      completions: metric?.completions ?? 0,
      listenedSeconds: Math.round(metric?.listenedSeconds ?? 0),
      uniqueListeners: metric?.listeners.size ?? 0
    };
  });

  return <PathwayAudioManager pathways={pathways}/>;
}
