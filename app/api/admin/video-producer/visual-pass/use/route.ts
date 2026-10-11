import { NextResponse } from "next/server";
import { getStudioPermission } from "@/auth";
import { runProducerVisualUse } from "@/video-producer-operation-visual-pass-use";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return runProducerVisualUse(request, access.user.id);
}
