import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminAccess } from "@/auth";
import { createSession, StudioPersistenceError } from "@/studio/repository";

const Schema = z.object({ episodeId: z.string().uuid(), runId: z.string().uuid() });

export async function POST(request: Request) {
  const access = await getAdminAccess();
  if (access.state !== "allowed" || !["owner", "admin", "editor"].includes(access.role ?? "")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid session request" }, { status: 400 });
  try {
    const result = await createSession(parsed.data);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create session" }, { status: error instanceof StudioPersistenceError ? 503 : 500 });
  }
}
