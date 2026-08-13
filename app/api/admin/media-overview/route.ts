import { NextResponse } from "next/server";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";
import { getSocialPublishingCredentialStatus } from "@/social-publishing-integrations";

const CORE_PLATFORMS = ["youtube", "instagram", "tiktok", "threads"] as const;

type MetricRow = {
  platform: string;
  captured_at: string;
  views: number | string | null;
  impressions: number | string | null;
  reach: number | string | null;
  likes: number | string | null;
  comments: number | string | null;
  shares: number | string | null;
  saves: number | string | null;
};

function n(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET() {
  const { access, allowed } = await getStudioPermission("view_distribution");
  if (!allowed || access.state !== "allowed") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const service = createServiceClient();
  const credentials = await getSocialPublishingCredentialStatus().catch(() => []);
  if (!service) return NextResponse.json({ platforms: [], calendarItems: [], credentials });

  const [metricsResult, calendarResult] = await Promise.all([
    service.from("publication_latest_metrics")
      .select("platform,captured_at,views,impressions,reach,likes,comments,shares,saves")
      .order("captured_at", { ascending: false })
      .limit(500),
    service.from("studio_content_calendar_items")
      .select("id,pathway_slug,title,content_type,platform,status,scheduled_for,published_at,source,source_ref,metadata,created_at,updated_at")
      .neq("status", "cancelled")
      .order("updated_at", { ascending: false })
      .limit(200)
  ]);

  const rows = (metricsResult.data ?? []) as MetricRow[];
  const platforms = CORE_PLATFORMS.map((platform) => {
    const platformRows = rows.filter((row) => row.platform === platform);
    return {
      platform,
      views: platformRows.reduce((sum, row) => sum + n(row.views), 0),
      impressions: platformRows.reduce((sum, row) => sum + n(row.impressions), 0),
      reach: platformRows.reduce((sum, row) => sum + n(row.reach), 0),
      likes: platformRows.reduce((sum, row) => sum + n(row.likes), 0),
      comments: platformRows.reduce((sum, row) => sum + n(row.comments), 0),
      shares: platformRows.reduce((sum, row) => sum + n(row.shares), 0),
      saves: platformRows.reduce((sum, row) => sum + n(row.saves), 0),
      capturedAt: platformRows[0]?.captured_at ?? null,
      records: platformRows.length
    };
  });

  return NextResponse.json({
    platforms,
    calendarItems: calendarResult.data ?? [],
    credentials,
    syncedAt: new Date().toISOString(),
    warnings: [metricsResult.error?.message, calendarResult.error?.message].filter(Boolean)
  });
}
