import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/supabase";

export const runtime = "nodejs";

const eventSchema = z.object({
  name: z.enum([
    "page_viewed",
    "topic_opened",
    "answer_opened",
    "article_opened",
    "scripture_opened",
    "pathway_started",
    "pathway_step_completed",
    "search_submitted",
    "search_result_opened",
    "search_no_results",
    "article_completed",
    "app_link_clicked",
    "content_shared"
  ]),
  path: z.string().min(1).max(1000),
  anonymousId: z.string().uuid(),
  sessionId: z.string().uuid(),
  referrer: z.string().max(2000).nullable().optional(),
  viewportWidth: z.number().int().positive().max(10000).optional(),
  properties: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional()
});

export async function POST(request: Request) {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > 16_384) return NextResponse.json({ error: "Payload too large" }, { status: 413 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = eventSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid event" }, { status: 400 });

  const service = createServiceClient();
  if (!service) return new NextResponse(null, { status: 204 });

  const deviceClass = parsed.data.viewportWidth
    ? parsed.data.viewportWidth < 700 ? "mobile" : parsed.data.viewportWidth < 1024 ? "tablet" : "desktop"
    : "unknown";

  const referrerHost = (() => {
    try { return parsed.data.referrer ? new URL(parsed.data.referrer).hostname : null; }
    catch { return null; }
  })();

  const analytics = service.schema("analytics");
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await analytics
    .from("events")
    .select("id", { head: true, count: "exact" })
    .eq("session_id", parsed.data.sessionId)
    .gte("occurred_at", oneHourAgo);

  if ((count ?? 0) >= 240) return new NextResponse(null, { status: 204 });

  const { error } = await analytics.from("events").insert({
    event_name: parsed.data.name,
    session_id: parsed.data.sessionId,
    anonymous_id: parsed.data.anonymousId,
    page_path: parsed.data.path,
    referrer_host: referrerHost,
    source: "WEBSITE",
    device_class: deviceClass,
    properties: parsed.data.properties ?? {}
  });

  if (error) console.error("analytics ingestion failed", { code: error.code });
  return new NextResponse(null, { status: 204 });
}
