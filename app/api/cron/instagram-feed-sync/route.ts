import { NextResponse } from "next/server";
import { cronRequestAuthorized } from "@/cron-auth";
import { syncInstagramFeedToCalendar } from "@/instagram-feed-sync";
import { shouldDeferInstagramFeedSync } from "@/instagram-feed-retry";
import { createServiceClient } from "@/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorized(request: Request) {
  return cronRequestAuthorized(request);
}

async function recordSyncState(error: string | null) {
  const service = createServiceClient();
  if (!service) return;
  const now = new Date().toISOString();
  const update = await service.from("social_connection_status").update({
    last_error: error ? error.slice(0, 1800) : null,
    updated_at: now
  }).eq("platform", "instagram");
  if (update.error) console.error("Instagram sync status persistence failed", update.error.message);
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET?.trim()) return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // An expired token cannot be repaired by polling Meta every 15 minutes.
  // Retain the persisted error for Studio Health while backing off calls.
  // Saving and verifying new credentials clears last_error immediately.
  const service = createServiceClient();
  if (service) {
    const previous = await service.from("social_connection_status")
      .select("last_error,updated_at")
      .eq("platform", "instagram")
      .maybeSingle();
    if (!previous.error && shouldDeferInstagramFeedSync(previous.data)) {
      return NextResponse.json({
        ok: false,
        skipped: true,
        reconnectRequired: true,
        reason: "Instagram token expired. Reconnect Instagram in Studio Setup."
      });
    }
  }

  try {
    const result = await syncInstagramFeedToCalendar(48);
    await recordSyncState(null);
    return NextResponse.json({ ok: true, synced: result.media.length, username: result.account.username ?? null, syncedAt: result.syncedAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Instagram feed sync failed.";
    console.error("Instagram feed sync failed", message);
    await recordSyncState(message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
