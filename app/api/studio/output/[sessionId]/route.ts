import { NextResponse } from "next/server";
import { getOutputSnapshot, StudioPersistenceError } from "@/studio/repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await context.params;
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!token) return NextResponse.json({ error: "Missing output token" }, { status: 401 });
  try {
    const snapshot = await getOutputSnapshot(sessionId, token);
    if (!snapshot) return NextResponse.json({ error: "Invalid output session" }, { status: 403 });
    return NextResponse.json(snapshot, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load output" }, { status: error instanceof StudioPersistenceError ? 503 : 500 });
  }
}
