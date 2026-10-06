import { NextResponse } from "next/server";
import { runCommentGuideCycle } from "@/comment-guide-runtime";
import { cronRequestAuthorized } from "@/cron-auth";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(request: Request) {
  return cronRequestAuthorized(request);
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET?.trim()) return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await runCommentGuideCycle({ classifyLimit: 8, deliveryLimit: 12 });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Comment Guide cron failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Comment Guide cron failed." }, { status: 500 });
  }
}
