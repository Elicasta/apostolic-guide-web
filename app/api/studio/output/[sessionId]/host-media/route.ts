import { NextResponse } from "next/server";
import { z } from "zod";
import { getHostSignalForOutput, saveHostAnswerFromOutput } from "@/studio/host-media-repository";

const AnswerSchema = z.object({ token: z.string().min(20), answerSdp: z.string().min(20).max(200000), signalVersion: z.number().int().nonnegative() });

export async function GET(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await context.params;
  const token = new URL(request.url).searchParams.get("token") ?? "";
  try {
    const signal = await getHostSignalForOutput(sessionId, token);
    if (!signal) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ signal });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to read host media signal" }, { status: 500 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await context.params;
  const parsed = AnswerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid WebRTC answer" }, { status: 400 });
  try {
    const signal = await saveHostAnswerFromOutput(sessionId, parsed.data.token, parsed.data.answerSdp, parsed.data.signalVersion);
    if (!signal) return NextResponse.json({ error: "Unauthorized or stale signal" }, { status: 401 });
    return NextResponse.json({ signal });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save host media answer" }, { status: 500 });
  }
}
