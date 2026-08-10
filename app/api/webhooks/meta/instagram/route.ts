import { NextResponse } from "next/server";
import { createServiceClient } from "@/supabase";
import { DEFAULT_META_VERIFY_TOKEN, processInstagramWebhook } from "@/social-messaging";
import { verifyMetaWebhookSignature } from "@/meta-webhook-signature";

export const runtime = "nodejs";

async function webhookSecrets() {
  const service = createServiceClient();
  if (!service) return { appSecret: "", verifyToken: DEFAULT_META_VERIFY_TOKEN };
  const { data } = await service.schema("analytics").from("integration_secrets")
    .select("name,secret")
    .in("name", ["meta_instagram_app_secret", "meta_instagram_verify_token"]);
  const values = new Map((data ?? []).map((row) => [String(row.name), String(row.secret)]));
  return {
    appSecret: values.get("meta_instagram_app_secret") ?? "",
    verifyToken: values.get("meta_instagram_verify_token") || DEFAULT_META_VERIFY_TOKEN
  };
}

async function logIngress(record: {
  method: string;
  signaturePresent?: boolean;
  signatureValid?: boolean | null;
  payloadObject?: string | null;
  entryCount?: number | null;
  parsedTriggerCount?: number | null;
  outcome: string;
  detail?: string | null;
}) {
  const service = createServiceClient();
  if (!service) return;
  await service.from("social_webhook_ingress").insert({
    method: record.method,
    signature_present: record.signaturePresent ?? false,
    signature_valid: record.signatureValid ?? null,
    payload_object: record.payloadObject ?? null,
    entry_count: record.entryCount ?? null,
    parsed_trigger_count: record.parsedTriggerCount ?? null,
    outcome: record.outcome,
    detail: record.detail?.slice(0, 500) ?? null
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const secrets = await webhookSecrets();
  const verified = mode === "subscribe" && token === secrets.verifyToken && Boolean(challenge);

  await logIngress({
    method: "GET",
    outcome: verified ? "verification_success" : "verification_rejected",
    detail: mode ? `mode=${mode}; challenge=${challenge ? "present" : "missing"}; token=${token ? "present" : "missing"}` : "direct_get"
  });

  if (verified && challenge) {
    return new NextResponse(challenge, { status: 200, headers: { "content-type": "text/plain" } });
  }
  return NextResponse.json({ error: "Webhook verification failed." }, { status: 403 });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const secrets = await webhookSecrets();
  const signature = request.headers.get("x-hub-signature-256");
  const signatureValid = verifyMetaWebhookSignature(rawBody, signature, secrets.appSecret);

  if (!signatureValid) {
    await logIngress({
      method: "POST",
      signaturePresent: Boolean(signature),
      signatureValid: false,
      outcome: "signature_rejected",
      detail: `body_bytes=${Buffer.byteLength(rawBody)}`
    });
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    await logIngress({ method: "POST", signaturePresent: true, signatureValid: true, outcome: "invalid_json" });
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const root = payload && typeof payload === "object" ? payload as { object?: unknown; entry?: unknown[] } : null;
  const payloadObject = typeof root?.object === "string" ? root.object : null;
  const entryCount = Array.isArray(root?.entry) ? root.entry.length : 0;

  const service = createServiceClient();
  if (service) {
    await service.from("social_connection_status").upsert({
      platform: "instagram",
      last_webhook_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }, { onConflict: "platform" });
  }

  try {
    const result = await processInstagramWebhook(payload);
    await logIngress({
      method: "POST",
      signaturePresent: true,
      signatureValid: true,
      payloadObject,
      entryCount,
      parsedTriggerCount: result.processed,
      outcome: result.processed > 0 ? "processed" : "accepted_no_trigger",
      detail: `sent=${result.sent}`
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook processing failed.";
    await logIngress({
      method: "POST",
      signaturePresent: true,
      signatureValid: true,
      payloadObject,
      entryCount,
      outcome: "processing_failed",
      detail: message
    });
    console.error("Instagram webhook processing failed", error);
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }
}
