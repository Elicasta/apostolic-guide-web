import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminAccess } from "@/auth";
import { getHostSignalForProducer, saveHostOffer } from "@/studio/host-media-repository";

const OfferSchema = z.object({ offerSdp: z.string().min(20).max(200000) });

export async function GET(_request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const access = await getAdminAccess();
  if (access.state !== "allowed" || !["owner", "admin", "editor"].includes(access.role ?? "")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { sessionId } = await context.params;
  try {
    const signal = await getHostSignalForProducer(sessionId);
    return NextResponse.json({ signal });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to read host media signal" }, { status: 500 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const access = await getAdminAccess();
  if (access.state !== "allowed" || !["owner", "admin", "editor"].includes(access.role ?? "")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = OfferSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid WebRTC offer" }, { status: 400 });
  const { sessionId } = await context.params;
  try {
    const signal = await saveHostOffer(sessionId, parsed.data.offerSdp);
    return NextResponse.json({ signal });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save host media offer" }, { status: 500 });
  }
}
