import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { CREATIVE_FORMATS, CREATIVE_INTENTS, normalizeEditorState } from "@/creative-project";
import { createCreativeCheckpoint, creativeProjectFromRow, loadCreativeProject } from "@/creative-project-server";
import { pathwayBySlug } from "@/pathway-catalog";
import { createServiceClient } from "@/supabase";

const schema = z.object({
  title: z.string().trim().min(1).max(180).optional(),
  revisionId: z.string().uuid().optional()
});
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
  if (!z.string().uuid().safeParse(projectId).success) return NextResponse.json({ error: "Invalid project ID." }, { status: 400 });
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid duplicate request." }, { status: 400 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  try {
    const source = await loadCreativeProject(service, projectId);
    if (!source) return NextResponse.json({ error: "Creative Project not found." }, { status: 404 });
    let base = {
      title: source.title,
      pathwaySlug: source.pathwaySlug,
      pathwayCollection: source.pathwayCollection,
      intent: source.intent,
      format: source.format,
      destination: source.destination,
      editorState: source.editorState,
      unifiedCaption: source.unifiedCaption,
      cta: source.cta,
      scriptureReferences: source.scriptureReferences,
      tags: source.tags,
      sourceLabel: source.title
    };
    if (parsed.data.revisionId) {
      const revision = await service.from("studio_creative_project_revisions")
        .select("version,snapshot")
        .eq("id", parsed.data.revisionId)
        .eq("project_id", projectId)
        .maybeSingle();
      if (revision.error) return NextResponse.json({ error: revision.error.message }, { status: 500 });
      if (!revision.data) return NextResponse.json({ error: "Revision not found." }, { status: 404 });
      const snapshot = snapshotSchema.safeParse(revision.data.snapshot);
      if (!snapshot.success) return NextResponse.json({ error: "Revision snapshot is not compatible with the current editor." }, { status: 409 });
      const pathway = pathwayBySlug(snapshot.data.pathwaySlug);
      if (!pathway) return NextResponse.json({ error: "Revision Pathway no longer exists." }, { status: 409 });
      base = { ...snapshot.data, editorState: normalizeEditorState(snapshot.data.format, snapshot.data.editorState), sourceLabel: `${source.title} v${revision.data.version}` };
    }
    const now = new Date().toISOString();
    const title = parsed.data.title || `${base.title} Copy`;
    const created = await service.from("studio_creative_projects").insert({
      title,
      pathway_slug: base.pathwaySlug,
      pathway_collection: base.pathwayCollection,
      intent: base.intent,
      format: base.format,
      destination: base.destination,
      frame_count: base.editorState.frames.length,
      status: "draft",
      editor_state: base.editorState,
      unified_caption: base.unifiedCaption,
      cta: base.cta,
      scripture_references: base.scriptureReferences,
      tags: base.tags,
      search_text: [title, base.pathwaySlug, base.intent, base.format, base.unifiedCaption, ...base.scriptureReferences, ...base.tags].join(" "),
      state_version: 1,
      last_autosaved_at: now,
      created_by: access.user.id,
      updated_by: access.user.id,
      created_at: now,
      updated_at: now
    }).select("*").single();
    if (created.error) return NextResponse.json({ error: created.error.message }, { status: 500 });
    const project = creativeProjectFromRow(created.data as Record<string, unknown>);
    const revision = await createCreativeCheckpoint(service, project, access.user.id, { reason: "duplicate_source", changeSummary: `Duplicated from ${base.sourceLabel}` });
    return NextResponse.json({ project, revision }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Creative Project could not be duplicated." }, { status: 500 });
  }
}
