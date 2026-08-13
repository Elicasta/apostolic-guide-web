import { NextResponse } from "next/server";
import { createServiceClient } from "@/supabase";
import { publishScheduledThreadsPost } from "@/threads-publisher";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });
  const due = await service.from("studio_threads_posts")
    .select("id,scheduled_for")
    .eq("status", "scheduled")
    .lte("scheduled_for", new Date().toISOString())
    .order("scheduled_for", { ascending: true })
    .limit(5);
  if (due.error) return NextResponse.json({ error: due.error.message }, { status: 500 });
  const results: Array<{ id:string; ok:boolean; error?:string }> = [];
  for (const post of due.data ?? []) {
    try { await publishScheduledThreadsPost(post.id); results.push({ id: post.id, ok: true }); }
    catch (error) { results.push({ id: post.id, ok: false, error: error instanceof Error ? error.message : "Threads publishing failed." }); }
  }
  return NextResponse.json({ ok: true, processed: results.length, results });
}
