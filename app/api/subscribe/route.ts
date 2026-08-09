import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/supabase";
import { buildWelcomeEmail } from "@/welcome-email";

export const runtime = "nodejs";

const subscriberSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  liveTeachings: z.boolean().default(true),
  newArticles: z.boolean().default(true),
  source: z.string().trim().max(120).default("website"),
  path: z.string().trim().max(500).default("/"),
  website: z.string().max(0).optional().default("")
});

type SubscriberInput = z.infer<typeof subscriberSchema>;

async function addResendContact(input: SubscriberInput) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { id: null, synced: false, error: "RESEND_API_KEY is not configured" };

  const topics = [
    input.liveTeachings && process.env.RESEND_LIVE_TEACHINGS_TOPIC_ID
      ? { id: process.env.RESEND_LIVE_TEACHINGS_TOPIC_ID, subscription: "opt_in" as const }
      : null,
    input.newArticles && process.env.RESEND_NEW_ARTICLES_TOPIC_ID
      ? { id: process.env.RESEND_NEW_ARTICLES_TOPIC_ID, subscription: "opt_in" as const }
      : null
  ].filter((item): item is { id: string; subscription: "opt_in" } => Boolean(item));

  const response = await fetch("https://api.resend.com/contacts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      email: input.email,
      unsubscribed: false,
      ...(topics.length ? { topics } : {})
    })
  });

  if (response.status === 409) return { id: null, synced: true, error: null };
  if (!response.ok) return { id: null, synced: false, error: await response.text() };
  const data = await response.json() as { id?: string };
  return { id: data.id ?? null, synced: true, error: null };
}

async function sendWelcomeEmail(input: SubscriberInput) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) return { id: null, sent: false, error: "Welcome email is not configured" };

  const welcome = buildWelcomeEmail(input);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `apostolic-guide-welcome-${input.email}`.slice(0, 256)
    },
    body: JSON.stringify({
      from,
      to: [input.email],
      subject: welcome.subject,
      html: welcome.html,
      text: welcome.text,
      tags: [{ name: "category", value: "subscriber_welcome" }]
    })
  });

  if (!response.ok) return { id: null, sent: false, error: await response.text() };
  const data = await response.json() as { id?: string };
  return { id: data.id ?? null, sent: true, error: null };
}

export async function GET() {
  const supabase = createServiceClient();
  if (!supabase || !process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    return NextResponse.json({ enabled: false });
  }

  try {
    const { error } = await supabase
      .from("email_subscribers")
      .select("id", { head: true, count: "exact" });
    return NextResponse.json({ enabled: !error });
  } catch {
    return NextResponse.json({ enabled: false });
  }
}

export async function POST(request: NextRequest) {
  let input: SubscriberInput;
  try {
    input = subscriberSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ ok: false, message: "Enter a valid email address." }, { status: 400 });
  }

  const supabase = createServiceClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, message: "Email signup is not configured yet." }, { status: 503 });
  }

  const now = new Date().toISOString();
  const { data: existing } = await supabase
    .from("email_subscribers")
    .select("id,status")
    .eq("email", input.email)
    .maybeSingle();

  const subscriberPayload = {
    email: input.email,
    status: "subscribed",
    wants_live_teachings: input.liveTeachings,
    wants_new_articles: input.newArticles,
    source: input.source,
    signup_path: input.path,
    last_signup_at: now,
    updated_at: now,
    ...(existing?.status === "subscribed" ? {} : { consented_at: now })
  };

  const { data: subscriber, error: databaseError } = await supabase
    .from("email_subscribers")
    .upsert(subscriberPayload, { onConflict: "email" })
    .select("id,email")
    .single();

  if (databaseError || !subscriber) {
    console.error("Subscriber database error", databaseError);
    return NextResponse.json({ ok: false, message: "We could not save your signup. Please try again." }, { status: 500 });
  }

  const resendContact = await addResendContact(input);
  const welcome = existing?.status === "subscribed"
    ? { id: null, sent: false, error: null }
    : await sendWelcomeEmail(input);

  await supabase
    .from("email_subscribers")
    .update({
      resend_contact_id: resendContact.id,
      resend_synced_at: resendContact.synced ? now : null,
      resend_error: resendContact.error ?? welcome.error,
      welcome_email_id: welcome.id,
      welcome_sent_at: welcome.sent ? now : null,
      updated_at: now
    })
    .eq("id", subscriber.id);

  return NextResponse.json({
    ok: true,
    message: existing?.status === "subscribed"
      ? "Your preferences have been updated."
      : "Check your inbox for a welcome from Apostolic Guide."
  });
}
