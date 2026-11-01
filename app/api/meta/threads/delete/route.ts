import crypto from "node:crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ ok: true, service: "apostolic-guide-threads-data-deletion" });
}

export async function POST() {
  const confirmationCode = crypto.randomBytes(12).toString("hex");
  return NextResponse.json({
    url: `https://apostolicguide.com/threads-data-deletion?code=${confirmationCode}`,
    confirmation_code: confirmationCode
  });
}
