import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { createCreativeCheckpoint, creativeProjectFromRow, loadCreativeProject } from "@/creative-project-server";
import { createServiceClient } from "@/supabase";

const schema = z.object({ title: z.string().trim().min(1).max(180).optional() });

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { projectId } = await context.params;
  if (!z.string().uuid().safeParse(projectId).success) return NextResponse.json({ error: "Invalid project ID." }, { status: 400 });
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid duplicate request." }, { status: 400 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  try {
    const source = await loadCreativeProject(service, projectId);
    if (!source) return NextResponse.json({ error: "Creative Project not found." }, { status: 404 });
    const now = new Date().toISOString();
    const created = await service.from("studio_creative_projects").insert({
      title: parsed.data.title || `${source.title} Copy`,
      pathway_slug: source.pathwaySlug,
      pathway_collection: source.pathwayCollection,
      intent: source.intent,
      format: source.format,
      destination: source.destination,
      frame_count: source.editorState.frames.length,
      status: "draft",
      editor_state: source.editorState,
      unified_caption: source.unifiedCaption,
      cta: source.cta,
      scripture_references: source.scriptureReferences,
      tags: source.tags,
      search_text: [parsed.data.title || `${source.title} Copy`, source.pathwayTitle, source.pathwaySlug, source.intent, source.format, source.unifiedCaption, ...source.scriptureReferences, ...source.tags].join(" "),
      state_version: 1,
      last_autosaved_at: now,
      created_by: access.user.id,
      updated_by: access.user.id,
      created_at: now,
      updated_at: now
    }).select("*").single();
    if (created.error) return NextResponse.json({ error: created.error.message }, { status: 500 });
    const project = creativeProjectFromRow(created.data as Record<string, unknown>);
    const revision = await createCreativeCheckpoint(service, project, access.user.id, { reason: "duplicate_source", changeSummary: `Duplicated from ${source.title}` });
    return NextResponse.json({ project, revision }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Creative Project could not be duplicated." }, { status: 500 });
  }
}
