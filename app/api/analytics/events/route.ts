import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/supabase";

export const runtime = "nodejs";

const eventSchema = z.object({
  name: z.enum([
    "page_viewed",
    "presence_heartbeat",
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
    "content_shared",
    "audio_started",
    "audio_progress",
    "audio_completed"
  ]),
  path: z.string().min(1).max(1000),
  anonymousId: z.string().uuid(),
  sessionId: z.string().uuid(),
  referrer: z.string().max(2000).nullable().optional(),
  viewportWidth: z.number().int().positive().max(10000).optional(),
  properties: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional()
});

function safeHost(value?: string | null) {
  try { return value ? new URL(value).hostname : null; }
  catch { return null; }
}

function classifyBrowser(userAgent: string) {
  if (/Edg\//i.test(userAgent)) return "Edge";
  if (/OPR\//i.test(userAgent)) return "Opera";
  if (/Chrome\//i.test(userAgent) && !/Chromium/i.test(userAgent)) return "Chrome";
  if (/Firefox\//i.test(userAgent)) return "Firefox";
  if (/Safari\//i.test(userAgent) && !/Chrome\//i.test(userAgent)) return "Safari";
  return "Other";
}

function classifyOs(userAgent: string) {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "iOS";
  if (/Android/i.test(userAgent)) return "Android";
  if (/Windows NT/i.test(userAgent)) return "Windows";
  if (/Mac OS X/i.test(userAgent)) return "macOS";
  if (/Linux/i.test(userAgent)) return "Linux";
  return "Other";
}

function header(request: Request, name: string) {
  const value = request.headers.get(name)?.trim();
  return value || null;
}

function stringProperty(properties: Record<string, string | number | boolean | null> | undefined, key: string) {
  const value = properties?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function resolvePersonId(service: NonNullable<ReturnType<typeof createServiceClient>>, anonymousId: string, url: URL) {
  const token = url.searchParams.get("agp");
  let personId: string | null = null;

  if (token && z.string().uuid().safeParse(token).success) {
    const person = await service.from("people").select("id").eq("attribution_token", token).maybeSingle();
    personId = person.data?.id ? String(person.data.id) : null;
    if (personId) await service.rpc("link_browser_identity", { p_person_id: personId, p_anonymous_id: anonymousId });
  }

  if (!personId) {
    const identity = await service.from("person_browser_identities").select("person_id").eq("anonymous_id", anonymousId).maybeSingle();
    personId = identity.data?.person_id ? String(identity.data.person_id) : null;
    if (personId) await service.from("person_browser_identities").update({ last_seen_at: new Date().toISOString() }).eq("anonymous_id", anonymousId);
  }

  return personId;
}

export async function POST(request: Request) {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > 16_384) return NextResponse.json({ error: "Payload too large" }, { status: 413 });

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = eventSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid event" }, { status: 400 });

  const service = createServiceClient();
  if (!service) return new NextResponse(null, { status: 204 });

  const deviceClass = parsed.data.viewportWidth ? parsed.data.viewportWidth < 700 ? "mobile" : parsed.data.viewportWidth < 1024 ? "tablet" : "desktop" : "unknown";
  const userAgent = header(request, "user-agent") ?? "";
  const url = new URL(parsed.data.path, "https://apostolicguide.com");
  const analytics = service.schema("analytics");
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await analytics.from("events").select("id", { head: true, count: "exact" }).eq("session_id", parsed.data.sessionId).gte("occurred_at", oneHourAgo);
  if ((count ?? 0) >= 240) return new NextResponse(null, { status: 204 });

  const personId = await resolvePersonId(service, parsed.data.anonymousId, url);
  const properties = parsed.data.properties ?? {};
  const { error } = await analytics.from("events").insert({
    event_name: parsed.data.name,
    session_id: parsed.data.sessionId,
    anonymous_id: parsed.data.anonymousId,
    person_id: personId,
    page_path: parsed.data.path,
    referrer_host: safeHost(parsed.data.referrer),
    source: "WEBSITE",
    device_class: deviceClass,
    country_code: header(request, "x-vercel-ip-country") ?? header(request, "cf-ipcountry"),
    region: header(request, "x-vercel-ip-country-region"),
    city: header(request, "x-vercel-ip-city"),
    user_agent: userAgent.slice(0, 1000) || null,
    browser: classifyBrowser(userAgent),
    os: classifyOs(userAgent),
    utm_source: url.searchParams.get("utm_source") ?? stringProperty(properties, "_utm_source"),
    utm_medium: url.searchParams.get("utm_medium") ?? stringProperty(properties, "_utm_medium"),
    utm_campaign: url.searchParams.get("utm_campaign") ?? stringProperty(properties, "_utm_campaign"),
    utm_content: url.searchParams.get("utm_content") ?? stringProperty(properties, "_utm_content"),
    utm_term: url.searchParams.get("utm_term") ?? stringProperty(properties, "_utm_term"),
    properties
  });

  if (personId) await service.from("people").update({ last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", personId);
  if (error) console.error("analytics ingestion failed", { code: error.code, message: error.message });
  return new NextResponse(null, { status: 204 });
}
