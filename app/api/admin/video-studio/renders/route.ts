import { NextResponse } from "next/server";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";

type ProgressSnapshot = {
  percent?: number;
  stage?: string;
  heartbeatAt?: string;
};

type RenderSnapshot = {
  rendererProgress?: ProgressSnapshot;
};

type RenderRow = {
  id: string;
  pathway_slug: string;
  asset_id: string | null;
  format: string;
  status: "queued" | "rendering" | "completed" | "failed";
  output_url: string | null;
  error: string | null;
  requested_at: string;
  started_at: string | null;
  completed_at: string | null;
  config_snapshot: unknown;
};

function progressFor(row: RenderRow) {
  const snapshot = row.config_snapshot && typeof row.config_snapshot === "object" ? row.config_snapshot as RenderSnapshot : {};
  const progress = snapshot.rendererProgress ?? {};
  const fallbackPercent = row.status === "completed" ? 100 : row.status === "rendering" ? 7 : row.status === "queued" ? 1 : 0;
  const fallbackStage = row.status === "completed" ? "Ready" : row.status === "rendering" ? "Rendering video" : row.status === "queued" ? "Queued" : "Failed";
  return {
    progress_percent: Math.max(0, Math.min(100, Number(progress.percent ?? fallbackPercent))),
    progress_stage: typeof progress.stage === "string" && progress.stage.trim() ? progress.stage.trim() : fallbackStage,
    progress_heartbeat_at: typeof progress.heartbeatAt === "string" ? progress.heartbeatAt : null
  };
}

function ageMs(value: string | null | undefined, now: number) {
  if (!value) return Number.POSITIVE_INFINITY;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, now - timestamp) : Number.POSITIVE_INFINITY;
}

export async function GET(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const slug = new URL(request.url).searchParams.get("slug")?.trim() ?? "";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return NextResponse.json({ error: "Invalid Pathway." }, { status: 400 });

  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });

  const result = await service.from("pathway_video_renders")
    .select("id,pathway_slug,asset_id,format,status,output_url,error,requested_at,started_at,completed_at,config_snapshot")
    .eq("pathway_slug", slug)
    .order("requested_at", { ascending: false })
    .limit(30);

  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });

  const now = Date.now();
  const rows = (result.data ?? []) as RenderRow[];
  const stale = rows.filter((row) => {
    if (row.status === "queued") return ageMs(row.requested_at, now) > 8 * 60_000;
    if (row.status !== "rendering") return false;
    const progress = progressFor(row);
    if (progress.progress_heartbeat_at) return ageMs(progress.progress_heartbeat_at, now) > 4 * 60_000;
    return ageMs(row.started_at ?? row.requested_at, now) > 31 * 60_000;
  });

  if (stale.length) {
    const completedAt = new Date().toISOString();
    await Promise.all(stale.flatMap((row) => {
      const error = row.status === "queued"
        ? "Renderer did not start in time. Re-render to use the optimized renderer."
        : "Renderer stopped reporting progress. Re-render to use the optimized renderer.";
      const updates: PromiseLike<unknown>[] = [
        service.from("pathway_video_renders").update({ status: "failed", error, completed_at: completedAt }).eq("id", row.id)
      ];
      if (row.asset_id) updates.push(service.from("pathway_assets").update({ status: "blocked", notes: error, updated_at: completedAt }).eq("id", row.asset_id));
      row.status = "failed";
      row.error = error;
      row.completed_at = completedAt;
      return updates;
    }));
  }

  return NextResponse.json({
    renders: rows.map((row) => {
      const progress = progressFor(row);
      return {
        id: row.id,
        pathway_slug: row.pathway_slug,
        format: row.format,
        status: row.status,
        output_url: row.output_url,
        error: row.error,
        requested_at: row.requested_at,
        completed_at: row.completed_at,
        ...progress
      };
    })
  });
}
