import { NextResponse } from "next/server";
import { getStudioPermission } from "@/auth";
import { runProducerVisualPlan } from "@/video-producer-operation-visual-pass";

export const runtime = "nodejs";
export const maxDuration = 300;
export { GET } from "@/video-producer-operation-visual-pass";

export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return runProducerVisualPlan(request, access.user.id);
}
