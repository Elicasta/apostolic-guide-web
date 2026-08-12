import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminAccess } from "@/auth";
import { addPathwayScriptureCue, getEpisode, StudioPersistenceError } from "@/studio/repository";

const Schema = z.object({
  pathwayId: z.string().min(1),
  reference: z.string().min(1).max(80),
  title: z.string().min(1).max(240),
  explanation: z.string().max(2000).default("")
});

export async function POST(request: Request, context: { params: Promise<{ episodeId: string }> }) {
  const access = await getAdminAccess();
  if (access.state !== "allowed" || !["owner", "admin", "editor"].includes(access.role ?? "")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { episodeId } = await context.params;
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid cue" }, { status: 400 });
  try {
    const episode = await getEpisode(episodeId);
    if (!episode?.run) return NextResponse.json({ error: "Episode run not found" }, { status: 404 });
    const position = episode.cues.length;
    const result = await addPathwayScriptureCue({ episodeId, runId: episode.run.id, position, ...parsed.data });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to add cue" }, { status: error instanceof StudioPersistenceError ? 503 : 500 });
  }
}
