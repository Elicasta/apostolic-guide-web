import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminAccess } from "@/auth";
import { isTeleprompterSessionState } from "@/lib/teleprompter/session-state";
import { createServiceClient } from "@/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sessionCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{7,10}$/);

const writeSchema = z.object({
  sessionCode: sessionCodeSchema,
  state: z.unknown(),
});

const noStoreHeaders = { "Cache-Control": "no-store" };

async function requireTeleprompterAdmin() {
  const access = await getAdminAccess();
  if (access.state === "signed_out" || access.state === "unconfigured") {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  if (access.state !== "allowed") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  return null;
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireTeleprompterAdmin();
  if (unauthorized) return unauthorized;

  const parsedCode = sessionCodeSchema.safeParse(
    request.nextUrl.searchParams.get("session"),
  );
  if (!parsedCode.success) {
    return NextResponse.json({ error: "Invalid session code." }, { status: 400 });
  }

  const service = createServiceClient();
  if (!service) {
    return NextResponse.json(
      { error: "Session sync is not configured." },
      { status: 503 },
    );
  }

  const result = await service
    .from("teleprompter_sessions")
    .select("state,expires_at")
    .eq("session_code", parsedCode.data)
    .maybeSingle();

  if (result.error) {
    console.error("Teleprompter session read failed", result.error.message);
    return NextResponse.json({ error: "Session read failed." }, { status: 500 });
  }
  if (!result.data || new Date(result.data.expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }
  if (!isTeleprompterSessionState(result.data.state)) {
    return NextResponse.json({ error: "Session state is invalid." }, { status: 500 });
  }

  return NextResponse.json({ state: result.data.state }, { headers: noStoreHeaders });
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireTeleprompterAdmin();
  if (unauthorized) return unauthorized;

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 64_000) {
    return NextResponse.json({ error: "Session state is too large." }, { status: 413 });
  }

  let input: z.infer<typeof writeSchema>;
  try {
    input = writeSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid session update." }, { status: 400 });
  }
  if (!isTeleprompterSessionState(input.state)) {
    return NextResponse.json({ error: "Invalid session state." }, { status: 400 });
  }

  const service = createServiceClient();
  if (!service) {
    return NextResponse.json(
      { error: "Session sync is not configured." },
      { status: 503 },
    );
  }

  const result = await service.rpc("save_teleprompter_session", {
    p_session_code: input.sessionCode,
    p_state: input.state,
    p_sequence: input.state.sequence,
  });
  if (result.error) {
    console.error("Teleprompter session write failed", result.error.message);
    return NextResponse.json({ error: "Session write failed." }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { headers: noStoreHeaders });
}
