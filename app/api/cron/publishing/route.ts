import { NextResponse } from "next/server";
import { executeScheduledPublication } from "@/scheduled-publishing";
import { createServiceClient } from "@/supabase";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET?.trim()) return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });
  const due = await service.from("pathway_publications")
    .select("id,pathway_slug,platform,scheduled_for")
    .eq("status", "scheduled")
    .in("platform", ["youtube", "instagram"])
    .lte("scheduled_for", new Date().toISOString())
    .order("scheduled_for", { ascending: true })
    .limit(3);
  if (due.error) return NextResponse.json({ error: due.error.message }, { status: 500 });

  const results: Array<{ id: string; ok: boolean; error?: string }> = [];
  for (const publication of due.data ?? []) {
    try {
      await executeScheduledPublication(publication.id);
      results.push({ id: publication.id, ok: true });
    } catch (error) {
      results.push({ id: publication.id, ok: false, error: error instanceof Error ? error.message : "Publishing failed." });
    }
  }
  return NextResponse.json({ ok: true, processed: results.length, results });
}
