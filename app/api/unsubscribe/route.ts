import { NextResponse } from "next/server";
import { createServiceClient } from "@/supabase";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const token = String(form?.get("token") ?? "");
  if (!/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(token))
    return NextResponse.json({ error: "Invalid unsubscribe link" }, { status: 400 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Email preferences unavailable" }, { status: 503 });
  const { data: subscriber, error } = await service.from("email_subscribers").select("id,email,status").eq("unsubscribe_token", token).maybeSingle();
  if (error || !subscriber) return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
  if (subscriber.status === "subscribed") {
    // Update Resend first; don't claim unsubscribed until both systems agree.
    if (!process.env.RESEND_API_KEY) return NextResponse.json({ error: "Email preferences temporarily unavailable" }, { status: 503 });
    let success = false;
    try {
      const response = await fetch("https://api.resend.com/contacts/" + encodeURIComponent(subscriber.email), {
        method: "PATCH",
        headers: { Authorization: "Bearer " + process.env.RESEND_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ unsubscribed: true })
      });
      success = response.ok || response.status === 404;
    } catch { /* transient upstream error */ }
    if (!success) return NextResponse.json({ error: "Unable to unsubscribe right now. Please try again." }, { status: 502 });
    const { error: updateError } = await service.from("email_subscribers").update({
      status: "unsubscribed", unsubscribed_at: new Date().toISOString(), updated_at: new Date().toISOString()
    }).eq("id", subscriber.id);
    if (updateError) return NextResponse.json({ error: "Unable to save email preferences" }, { status: 503 });
  }
  return new NextResponse("<!doctype html><html><head><meta charset='UTF-8'></head><body style='font-family:Arial;max-width:520px;margin:90px auto;padding:24px'><h1>Unsubscribed</h1><p>You will no longer receive Apostolic Guide email updates.</p><a href='https://www.apostolicguide.com'>Return to Apostolic Guide</a></body></html>", { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
