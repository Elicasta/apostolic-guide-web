import { NextResponse } from "next/server";
import { cronRequestAuthorized } from "@/cron-auth";
import { createServiceClient } from "@/supabase";
import { advanceProducerDraft } from "@/video-producer-draft-server";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET?.trim())
    return NextResponse.json(
      { error: "CRON_SECRET is not configured." },
      { status: 503 },
    );
  if (!cronRequestAuthorized(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const service = createServiceClient();
  if (!service)
    return NextResponse.json(
      { error: "Project storage is unavailable." },
      { status: 503 },
    );
  const jobs = await service
    .from("video_producer_projects")
    .select("id,director_metadata")
    .eq("director_metadata->draftJob->>status", "running")
    .eq(
      "director_metadata->draftJob->>environment",
      process.env.VERCEL_ENV || "development",
    )
    .is("deleted_at", null)
    .order("updated_at")
    .limit(20);
  if (jobs.error)
    return NextResponse.json({ error: jobs.error.message }, { status: 500 });
  const next = jobs.data?.find(
    (p) =>
      !(
        Date.parse(p.director_metadata?.draftJob?.leaseUntil ?? "") > Date.now()
      ),
  );
  if (next) await advanceProducerDraft(next.id);
  return NextResponse.json({ advanced: next?.id ?? null });
}
