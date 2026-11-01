import { NextResponse } from "next/server";
import { z } from "zod";
import { insertSongDraft, latestEvaluationForDraft, listSongDrafts, requireSongStudioAccess } from "@/song-studio/server";

export const runtime = "nodejs";

const saveSchema = z.object({
  project_id: z.string().uuid(),
  title: z.string().trim().min(1).max(160),
  lyrics: z.string().min(1).max(30000),
  notes: z.string().max(5000).optional(),
  source: z.enum(["human", "hybrid"]).default("human")
});

export async function GET(request: Request) {
  const auth = await requireSongStudioAccess();
  if (!auth.ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const projectId = new URL(request.url).searchParams.get("projectId");
  if (!projectId || !z.string().uuid().safeParse(projectId).success) return NextResponse.json({ error: "Valid projectId required." }, { status: 400 });

  try {
    const drafts = await listSongDrafts(projectId);
    const evaluations = await Promise.all(drafts.map((draft) => latestEvaluationForDraft(draft.id)));
    return NextResponse.json({ drafts: drafts.map((draft, index) => ({ ...draft, evaluation: evaluations[index] })) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load drafts." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireSongStudioAccess();
  if (!auth.ok || !auth.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = saveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid draft.", issues: parsed.error.flatten() }, { status: 400 });

  try {
    const draft = await insertSongDraft({
      projectId: parsed.data.project_id,
      title: parsed.data.title,
      lyrics: parsed.data.lyrics,
      notes: parsed.data.notes,
      source: parsed.data.source,
      userId: auth.user.id
    });
    return NextResponse.json({ draft }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save draft." }, { status: 500 });
  }
}
