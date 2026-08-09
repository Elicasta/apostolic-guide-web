import { NextResponse } from "next/server";
import { verifyResendWebhook } from "@/campaign-intelligence";
import { createServiceClient } from "@/supabase";

export const runtime = "nodejs";

const EMAIL_EVENTS = new Set([
  "email.sent",
  "email.delivered",
  "email.delivery_delayed",
  "email.opened",
  "email.clicked",
  "email.bounced",
  "email.complained",
  "email.failed",
  "email.suppressed"
]);

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function booleanValue(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function recipients(data: JsonObject) {
  return Array.isArray(data.to) ? data.to.filter((value): value is string => typeof value === "string") : [];
}

async function syncSubscriberHealth(service: NonNullable<ReturnType<typeof createServiceClient>>, eventType: string, data: JsonObject, eventAt: string) {
  if (eventType === "contact.updated") {
    const email = stringValue(data.email)?.toLowerCase();
    if (!email || booleanValue(data.unsubscribed) !== true) return;
    await service.from("email_subscribers").update({ status: "unsubscribed", unsubscribed_at: eventAt, updated_at: eventAt }).eq("email", email);
    return;
  }

  const status = eventType === "email.bounced" ? "bounced" : eventType === "email.complained" ? "complained" : null;
  if (!status) return;
  const emails = recipients(data).map((email) => email.toLowerCase());
  if (!emails.length) return;
  await service.from("email_subscribers").update({ status, updated_at: eventAt }).in("email", emails);
}

export async function POST(request: Request) {
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Webhook storage unavailable" }, { status: 503 });

  const raw = await request.text();
  if (raw.length > 128_000) return NextResponse.json({ error: "Payload too large" }, { status: 413 });

  const analytics = service.schema("analytics");
  const { data: secretRow, error: secretError } = await analytics.from("integration_secrets")
    .select("secret")
    .eq("name", "resend_webhook_secret")
    .maybeSingle();
  if (secretError || !secretRow?.secret) return NextResponse.json({ error: "Webhook verification unavailable" }, { status: 503 });

  const svixId = request.headers.get("svix-id");
  const verified = verifyResendWebhook(raw, {
    id: svixId,
    timestamp: request.headers.get("svix-timestamp"),
    signature: request.headers.get("svix-signature")
  }, secretRow.secret);
  if (!verified) return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });

  let payload: JsonObject;
  try { payload = object(JSON.parse(raw)); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const eventType = stringValue(payload.type);
  const eventAt = stringValue(payload.created_at) ?? new Date().toISOString();
  const data = object(payload.data);
  if (!eventType || !svixId) return NextResponse.json({ error: "Invalid event" }, { status: 400 });

  await syncSubscriberHealth(service, eventType, data, eventAt);
  if (!EMAIL_EVENTS.has(eventType)) return NextResponse.json({ ok: true });

  const broadcastId = stringValue(data.broadcast_id);
  const emailId = stringValue(data.email_id);
  if (!broadcastId || !emailId) return NextResponse.json({ ok: true });

  const { data: campaign } = await analytics.from("email_campaigns")
    .select("id,sent_at")
    .eq("resend_broadcast_id", broadcastId)
    .maybeSingle();

  const click = object(data.click);
  const failed = object(data.failed);
  const bounced = object(data.bounce);
  const suppressed = object(data.suppressed);
  const clickedUrl = eventType === "email.clicked" ? stringValue(click.link) : null;
  const reason = stringValue(failed.reason) ?? stringValue(bounced.message) ?? stringValue(bounced.reason) ?? stringValue(suppressed.reason);

  const { error: insertError } = await analytics.from("email_events").upsert({
    svix_id: svixId,
    event_type: eventType,
    resend_broadcast_id: broadcastId,
    campaign_id: campaign?.id ?? null,
    email_id: emailId,
    clicked_url: clickedUrl,
    reason,
    event_at: eventAt
  }, { onConflict: "svix_id", ignoreDuplicates: true });

  if (insertError) {
    console.error("Resend webhook insert failed", { code: insertError.code, message: insertError.message });
    return NextResponse.json({ error: "Webhook storage failed" }, { status: 500 });
  }

  if (campaign?.id && eventType === "email.sent") {
    const update: Record<string, unknown> = { status: "sent", updated_at: eventAt };
    if (!campaign.sent_at) update.sent_at = eventAt;
    await analytics.from("email_campaigns").update(update).eq("id", campaign.id);
  }

  return NextResponse.json({ ok: true });
}
