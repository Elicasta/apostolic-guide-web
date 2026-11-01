import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  if (error) return NextResponse.redirect(new URL("/admin/setup?threads=denied#social-publishing", url.origin));
  if (code) return NextResponse.redirect(new URL("/admin/setup?threads=callback_received#social-publishing", url.origin));
  return NextResponse.json({ ok: true, service: "apostolic-guide-threads-oauth-callback" });
}
