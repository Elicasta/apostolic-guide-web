import { NextResponse } from "next/server";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";
import { evaluateYoutubeGrowthLearning, youtubeChannelBaselineSchema, youtubePerformanceSnapshotSchema, type YoutubePerformanceSnapshot } from "@/video-producer-growth";

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function snapshotsFrom(value: unknown): YoutubePerformanceSnapshot[] {
  const metrics = objectValue(value);
  if (!Array.isArray(metrics.snapshots)) return [];
  return metrics.snapshots.flatMap((item) => {
    const parsed = youtubePerformanceSnapshotSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

function baselineFrom(rows: Array<Record<string, unknown>>, format: string) {
  const latest = rows.filter((row) => String(row.format || "") === format).flatMap((row) => {
    const snapshots = snapshotsFrom(row.growth_metrics);
    return snapshots.length ? [snapshots[snapshots.length - 1]] : [];
  }).filter((item) => item.impressions > 0 && item.views > 0);
  if (latest.length < 3) return null;
  const first30 = latest.map((item) => item.first30SecondRetention).filter((value): value is number => typeof value === "number");
  return youtubeChannelBaselineSchema.parse({
    sampleEpisodes: latest.length,
    clickThroughRate: latest.reduce((sum, item) => sum + item.clickThroughRate, 0) / latest.length,
    averagePercentageViewed: latest.reduce((sum, item) => sum + item.averagePercentageViewed, 0) / latest.length,
    first30SecondRetention: first30.length >= 3 ? first30.reduce((sum, value) => sum + value, 0) / first30.length : null
  });
}

export async function POST(request: Request, context: { params: Promise<{ episodeId: string }> }) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const raw = objectValue(await request.json().catch(() => ({})));
  const snapshot = youtubePerformanceSnapshotSchema.safeParse({ ...raw, capturedAt: typeof raw.capturedAt === "string" ? raw.capturedAt : new Date().toISOString() });
  if (!snapshot.success) return NextResponse.json({ error: snapshot.error.issues[0]?.message || "Invalid performance snapshot." }, { status: 400 });
  const { episodeId } = await context.params;
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });
  const episode = await service.from("video_producer_episode_scripts").select("id,format,growth_metrics").eq("id", episodeId).maybeSingle();
  if (episode.error) return NextResponse.json({ error: episode.error.message }, { status: 500 });
  if (!episode.data) return NextResponse.json({ error: "Episode was not found." }, { status: 404 });
  const peers = await service.from("video_producer_episode_scripts").select("id,format,growth_metrics").neq("id", episodeId);
  if (peers.error) return NextResponse.json({ error: peers.error.message }, { status: 500 });
  const baseline = baselineFrom((peers.data ?? []) as Array<Record<string, unknown>>, String(episode.data.format || "solo"));
  const learning = evaluateYoutubeGrowthLearning(snapshot.data, baseline);
  const existing = snapshotsFrom(episode.data.growth_metrics);
  const snapshots = [...existing, snapshot.data].slice(-20);
  const saved = await service.from("video_producer_episode_scripts").update({
    growth_metrics: { snapshots, latest: snapshot.data },
    growth_learning: learning,
    updated_by: access.user.id
  }).eq("id", episodeId).select("*").single();
  if (saved.error) return NextResponse.json({ error: saved.error.message }, { status: 500 });
  return NextResponse.json({ episode: saved.data, baseline, learning });
}
