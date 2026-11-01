import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";

export const runtime = "nodejs";

const schema = z.object({ action: z.enum(["trash", "restore"]) });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Invalid project id." }, { status: 400 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid recovery action." }, { status: 400 });

  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });

  const projectResult = await service.from("video_producer_projects")
    .select("id,title,mode,parent_project_id,deleted_at")
    .eq("id", id)
    .maybeSingle();
  if (projectResult.error) return NextResponse.json({ error: projectResult.error.message }, { status: 500 });
  const project = projectResult.data;
  if (!project) return NextResponse.json({ error: "Video Producer project not found." }, { status: 404 });

  if (parsed.data.action === "trash") {
    if (project.deleted_at) return NextResponse.json({ ok: true, state: "trashed", projectId: id });
    const now = new Date().toISOString();
    const rootUpdate = await service.from("video_producer_projects").update({
      deleted_at: now,
      deleted_by: access.user.id,
      updated_at: now,
      updated_by: access.user.id
    }).eq("id", id).is("deleted_at", null);
    if (rootUpdate.error) return NextResponse.json({ error: rootUpdate.error.message }, { status: 500 });

    // A Podcast owns its child Reels as one delivery package. Moving the parent to
    // Recovery moves those children with it, while deleting a single Reel only moves that Reel.
    if (!project.parent_project_id) {
      const children = await service.from("video_producer_projects").update({
        deleted_at: now,
        deleted_by: access.user.id,
        updated_at: now,
        updated_by: access.user.id
      }).eq("parent_project_id", id).is("deleted_at", null);
      if (children.error) return NextResponse.json({ error: children.error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, state: "trashed", projectId: id });
  }

  if (!project.deleted_at) return NextResponse.json({ ok: true, state: "active", projectId: id });
  if (project.parent_project_id) {
    const parentResult = await service.from("video_producer_projects").select("id,deleted_at").eq("id", project.parent_project_id).maybeSingle();
    if (parentResult.error) return NextResponse.json({ error: parentResult.error.message }, { status: 500 });
    if (parentResult.data?.deleted_at) return NextResponse.json({ error: "Restore the parent Podcast first so this Reel returns to the correct delivery package." }, { status: 409 });
  }

  const now = new Date().toISOString();
  const rootRestore = await service.from("video_producer_projects").update({
    deleted_at: null,
    deleted_by: null,
    updated_at: now,
    updated_by: access.user.id
  }).eq("id", id).not("deleted_at", "is", null);
  if (rootRestore.error) return NextResponse.json({ error: rootRestore.error.message }, { status: 500 });

  if (!project.parent_project_id) {
    const children = await service.from("video_producer_projects").update({
      deleted_at: null,
      deleted_by: null,
      updated_at: now,
      updated_by: access.user.id
    }).eq("parent_project_id", id).not("deleted_at", "is", null);
    if (children.error) return NextResponse.json({ error: children.error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, state: "active", projectId: id });
}
