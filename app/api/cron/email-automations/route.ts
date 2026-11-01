import { NextResponse } from "next/server";
import { cronRequestAuthorized } from "@/cron-auth";
import { runDueWelcomeDeliveries } from "@/email-automations";

export const runtime = "nodejs";
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET?.trim()) return NextResponse.json({ error: "Cron secret missing" }, { status: 503 });
  if (!cronRequestAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await runDueWelcomeDeliveries(20);
    return NextResponse.json({ ok: true, processed: result.processed, results: result.results.reduce<Record<string,number>>((counts, state) => ({ ...counts, [state]: (counts[state] ?? 0) + 1 }), {}) });
  } catch {
    return NextResponse.json({ error: "Welcome queue unavailable" }, { status: 503 });
  }
}
