import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminAccess } from "@/auth";
import { updateCueNotes } from "@/studio/run-repository";

const Schema = z.object({ presenterNotes: z.string().max(8000) });

export async function PATCH(request: Request, context: { params: Promise<{ cueId: string }> }) {
  const access = await getAdminAccess();
  if (access.state !== "allowed" || !["owner", "admin", "editor"].includes(access.role ?? "")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid presenter notes" }, { status: 400 });
  const { cueId } = await context.params;
  try {
    const cue = await updateCueNotes(cueId, parsed.data.presenterNotes);
    return NextResponse.json({ cue });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update cue" }, { status: 500 });
  }
}
