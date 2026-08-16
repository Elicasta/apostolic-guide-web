import { NextResponse } from "next/server";
import { createServiceClient } from "@/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET?.trim()) return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  const expired = await service.from("studio_pathway_asset_uploads")
    .select("id,storage_bucket,storage_path,status")
    .lt("expires_at", new Date().toISOString())
    .not("status", "in", "(finalized,cancelled,expired)")
    .order("expires_at", { ascending: true })
    .limit(100);
  if (expired.error) return NextResponse.json({ error: expired.error.message }, { status: 500 });

  let removed = 0;
  for (const session of expired.data ?? []) {
    const storage = await service.storage.from(session.storage_bucket).remove([session.storage_path]);
    if (!storage.error) removed += 1;
  }
  const ids = (expired.data ?? []).map((session) => session.id);
  if (ids.length) {
    const updated = await service.from("studio_pathway_asset_uploads").update({
      status: "expired",
      tus_url: null,
      error_message: "Upload session expired after 24 hours.",
      updated_at: new Date().toISOString()
    }).in("id", ids);
    if (updated.error) return NextResponse.json({ error: updated.error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, expired: ids.length, removed });
}
