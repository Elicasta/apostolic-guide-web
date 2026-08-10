import { NextResponse } from "next/server";
import { getStudioPermission } from "@/auth";
import { buildAIInterpretationContext } from "@/ai-interpretation";
import { getStudioIntelligence } from "@/studio-intelligence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { access, allowed } = await getStudioPermission("view_analytics");
  if (!allowed || access.state !== "allowed") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const snapshot = await getStudioIntelligence();
  return NextResponse.json({ snapshot, aiContext: buildAIInterpretationContext(snapshot) }, { headers: { "Cache-Control": "no-store" } });
}
