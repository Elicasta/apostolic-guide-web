import { NextResponse } from "next/server";
import { cronRequestAuthorized } from "@/cron-auth";
import { createServiceClient } from "@/supabase";
import { prepareEditorialWindow } from "@/editorial-engine-server";
export const runtime = "nodejs";
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET?.trim()) return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  if (!cronRequestAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const settings = await service.from("studio_editorial_settings").select("enabled").eq("id", true).single();
  if (settings.error) return NextResponse.json({ error: settings.error.message }, { status: 503 });
  if (!settings.data.enabled) return NextResponse.json({ ok: true, skipped: true, reason: "Draft production is paused." });
  try { return NextResponse.json({ ok: true, ...await prepareEditorialWindow() }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Draft production failed." }, { status: 503 }); }
}
