import { NextResponse } from "next/server";
import { getStudioPermission } from "@/auth";
import { runProducerDirect } from "@/video-producer-operation-direct";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return runProducerDirect(request, access.user.id);
}
