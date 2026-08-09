import { NextResponse } from "next/server";
import { createServiceClient } from "@/supabase";
import { DEFAULT_META_VERIFY_TOKEN, processInstagramWebhook, verifyMetaSignature } from "@/social-messaging";

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

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const secrets = await webhookSecrets();
  if (mode === "subscribe" && token === secrets.verifyToken && challenge) {
    return new NextResponse(challenge, { status: 200, headers: { "content-type": "text/plain" } });
  }
  return NextResponse.json({ error: "Webhook verification failed." }, { status: 403 });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const secrets = await webhookSecrets();
  const signature = request.headers.get("x-hub-signature-256");
  if (!verifyMetaSignature(rawBody, signature, secrets.appSecret)) {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }
  let payload: unknown;
  try { payload = JSON.parse(rawBody); }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  try {
    const result = await processInstagramWebhook(payload);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Instagram webhook processing failed", error);
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }
}
