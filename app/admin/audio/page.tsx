import { redirect } from "next/navigation";
import { getStudioPermission } from "@/auth";
import { allPathways } from "@/pathway-catalog";
import { pathwayNarrationHash } from "@/pathway-audio";
import { PathwayAudioManager } from "@/pathway-audio-manager";
import { createServiceClient } from "@/supabase";

type AudioAssetRow = { pathway_slug: string; audio_url: string; content_hash: string; generated_at: string };
type ScriptRow = { pathway_slug: string; script_text: string; source_hash: string; script_hash: string; status: "draft" | "approved"; model: string | null; updated_at: string };
type AudioMetricRow = { pathway_slug: string; starts: number | string | null; unique_listeners: number | string | null; completions: number | string | null; listened_seconds: number | string | null };

export default async function AdminPathwayAudioPage() {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed") redirect("/admin");

  const service = createServiceClient();
  let assetRows: AudioAssetRow[] = [];
  let scriptRows: ScriptRow[] = [];
  let metricRows: AudioMetricRow[] = [];

  if (service) {
    const [assetsResult, scriptsResult, metricsResult] = await Promise.all([
      service.from("pathway_audio_assets").select("pathway_slug,audio_url,content_hash,generated_at"),
      service.from("pathway_audio_scripts").select("pathway_slug,script_text,source_hash,script_hash,status,model,updated_at"),
      service.schema("analytics").from("pathway_audio_metrics").select("pathway_slug,starts,unique_listeners,completions,listened_seconds")
    ]);
    assetRows = (assetsResult.data ?? []) as AudioAssetRow[];
    scriptRows = (scriptsResult.data ?? []) as ScriptRow[];
    metricRows = (metricsResult.data ?? []) as AudioMetricRow[];
  }

  const assets = new Map(assetRows.map((row) => [row.pathway_slug, row]));
  const scripts = new Map(scriptRows.map((row) => [row.pathway_slug, row]));
  const stats = new Map(metricRows.map((row) => [row.pathway_slug, {
    starts: Number(row.starts ?? 0), uniqueListeners: Number(row.unique_listeners ?? 0), completions: Number(row.completions ?? 0), listenedSeconds: Number(row.listened_seconds ?? 0)
  }]));

  const pathways = allPathways.map((pathway) => {
    const asset = assets.get(pathway.slug);
    const script = scripts.get(pathway.slug);
    const metric = stats.get(pathway.slug);
    const sourceCurrent = Boolean(script?.source_hash && script.source_hash === pathwayNarrationHash(pathway));
    const scriptApproved = script?.status === "approved" && sourceCurrent;
    return {
      slug: pathway.slug,
      title: pathway.title,
      estimatedMinutes: pathway.estimatedMinutes,
      audioUrl: asset?.audio_url ?? null,
      generatedAt: asset?.generated_at ?? null,
      current: Boolean(asset?.content_hash && scriptApproved && asset.content_hash === script?.script_hash),
      scriptText: script?.script_text ?? "",
      scriptStatus: script?.status ?? null,
      scriptModel: script?.model ?? null,
      scriptUpdatedAt: script?.updated_at ?? null,
      sourceCurrent,
      starts: metric?.starts ?? 0,
      completions: metric?.completions ?? 0,
      listenedSeconds: Math.round(metric?.listenedSeconds ?? 0),
      uniqueListeners: metric?.uniqueListeners ?? 0
    };
  });

  return <PathwayAudioManager pathways={pathways}/>;
}
