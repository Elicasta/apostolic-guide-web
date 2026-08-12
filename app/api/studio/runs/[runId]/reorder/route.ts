import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminAccess } from "@/auth";
import { reorderRunCues } from "@/studio/run-repository";
import { StudioPersistenceError } from "@/studio/repository";

const Schema = z.object({ cueIds: z.array(z.string().uuid()).max(200) });

export async function POST(request: Request, context: { params: Promise<{ runId: string }> }) {
  const access = await getAdminAccess();
  if (access.state !== "allowed" || !["owner", "admin", "editor"].includes(access.role ?? "")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid cue order" }, { status: 400 });
  const { runId } = await context.params;
  try {
    const cues = await reorderRunCues(runId, parsed.data.cueIds);
    return NextResponse.json({ cues });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to reorder cues";
    return NextResponse.json({ error: message }, { status: error instanceof StudioPersistenceError ? 409 : 500 });
  }
}
