import { NextResponse } from "next/server";
import { syncInstagramFeedToCalendar } from "@/instagram-feed-sync";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET?.trim()) return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await syncInstagramFeedToCalendar(48);
    return NextResponse.json({ ok: true, synced: result.media.length, username: result.account.username ?? null, syncedAt: result.syncedAt });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Instagram feed sync failed." }, { status: 502 });
  }
}
