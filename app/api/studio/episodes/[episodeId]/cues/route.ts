import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminAccess } from "@/auth";
import { scriptures } from "@/data";
import { createServiceClient } from "@/supabase";
import { addPathwayScriptureCue, getEpisode, StudioPersistenceError } from "@/studio/repository";

const Schema = z.object({
  pathwayId: z.string().min(1),
  reference: z.string().min(1).max(80),
  title: z.string().min(1).max(240),
  explanation: z.string().max(2000).default("")
});

function normalizeReference(value: string) {
  return value.toLowerCase().replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
}

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

    const canonical = scriptures.find((item) => normalizeReference(item.reference) === normalizeReference(parsed.data.reference));
    if (canonical) {
      const service = createServiceClient();
      if (service) {
        const snapshot = {
          pathwayId: parsed.data.pathwayId,
          reference: canonical.reference,
          title: parsed.data.title,
          explanation: parsed.data.explanation,
          text: canonical.text,
          translation: canonical.translation,
          mainPoint: canonical.mainPoint,
          context: canonical.context,
          apostolicConnection: canonical.apostolicConnection
        };
        await service.from("studio_assets").update({ snapshot_data: snapshot }).eq("id", result.asset.id);
      }
    }

    return NextResponse.json({ ...result, canonicalScripture: Boolean(canonical) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to add cue" }, { status: error instanceof StudioPersistenceError ? 503 : 500 });
  }
}
