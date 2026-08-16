import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { CREATIVE_FORMATS, CREATIVE_INTENTS } from "@/creative-project";
import { createCreativeCheckpoint, creativeProjectFromRow, creativeProjectUpdatePayload, loadCreativeProject } from "@/creative-project-server";
import { createServiceClient } from "@/supabase";

const requestSchema = z.object({ revisionId: z.string().uuid() });
const snapshotSchema = z.object({
  title: z.string().min(1).max(180),
  pathwaySlug: z.string(),
  pathwayCollection: z.string(),
  intent: z.enum(CREATIVE_INTENTS),
  format: z.enum(CREATIVE_FORMATS),
  destination: z.string(),
  editorState: z.record(z.string(), z.unknown()),
  unifiedCaption: z.string().default(""),
  cta: z.string().default(""),
  scriptureReferences: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([])
});

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { projectId } = await context.params;
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!z.string().uuid().safeParse(projectId).success || !parsed.success) return NextResponse.json({ error: "Invalid restore request." }, { status: 400 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  try {
    const [current, revisionResult] = await Promise.all([
      loadCreativeProject(service, projectId),
      service.from("studio_creative_project_revisions").select("id,version,snapshot").eq("id", parsed.data.revisionId).eq("project_id", projectId).maybeSingle()
    ]);
    if (!current) return NextResponse.json({ error: "Creative Project not found." }, { status: 404 });
    if (revisionResult.error) return NextResponse.json({ error: revisionResult.error.message }, { status: 500 });
    if (!revisionResult.data) return NextResponse.json({ error: "Revision not found." }, { status: 404 });
    const snapshot = snapshotSchema.safeParse(revisionResult.data.snapshot);
    if (!snapshot.success) return NextResponse.json({ error: "Revision snapshot is no longer compatible with the editor." }, { status: 409 });

    const payload = creativeProjectUpdatePayload({ ...snapshot.data, status: "draft" });
    const now = new Date().toISOString();
    const updated = await service.from("studio_creative_projects").update({
      ...payload,
      status: "draft",
      state_version: current.stateVersion + 1,
      last_autosaved_at: now,
      updated_by: access.user.id,
      updated_at: now
    }).eq("id", projectId).select("*").single();
    if (updated.error) return NextResponse.json({ error: updated.error.message }, { status: 500 });
    const project = creativeProjectFromRow(updated.data as Record<string, unknown>);
    const revision = await createCreativeCheckpoint(service, project, access.user.id, {
      reason: "restore",
      changeSummary: `Restored version ${revisionResult.data.version}. Previous and later history retained.`,
      restoredFromRevisionId: revisionResult.data.id
    });
    return NextResponse.json({ project, revision });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Revision could not be restored." }, { status: 500 });
  }
}
