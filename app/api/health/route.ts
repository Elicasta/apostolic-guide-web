import { NextResponse } from "next/server";
import { createServiceClient, isSupabaseConfigured, isSupabaseServiceConfigured } from "@/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const checks = {
    supabasePublic: isSupabaseConfigured(),
    supabaseService: isSupabaseServiceConfigured(),
    resendApi: Boolean(process.env.RESEND_API_KEY),
    resendSender: Boolean(process.env.RESEND_FROM_EMAIL),
    liveTeachingTopic: Boolean(process.env.RESEND_LIVE_TEACHINGS_TOPIC_ID),
    newArticlesTopic: Boolean(process.env.RESEND_NEW_ARTICLES_TOPIC_ID),
    contactEmail: Boolean(process.env.NEXT_PUBLIC_CONTACT_EMAIL)
  };

  let subscriberDatabase = false;
  const supabase = createServiceClient();
  if (supabase) {
    try {
      const { error } = await supabase
        .from("email_subscribers")
        .select("id", { head: true, count: "exact" });
      subscriberDatabase = !error;
    } catch {}
  }

  const required = [
    checks.supabaseService,
    checks.resendApi,
    checks.resendSender,
    subscriberDatabase
  ];

  return NextResponse.json({
    ok: required.every(Boolean),
    service: "apostolic-guide-web",
    checks: { ...checks, subscriberDatabase },
    timestamp: new Date().toISOString()
  }, {
    headers: { "Cache-Control": "no-store" }
  });
}
