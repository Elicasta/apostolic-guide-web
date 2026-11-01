import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";

export async function DELETE(_request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { projectId } = await context.params;
  if (!z.string().uuid().safeParse(projectId).success) return NextResponse.json({ error: "Invalid project ID." }, { status: 400 });

  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  const project = await service.from("studio_creative_projects").select("id,title,status").eq("id", projectId).maybeSingle();
  if (project.error) return NextResponse.json({ error: project.error.message }, { status: 500 });
  if (!project.data) return NextResponse.json({ error: "Creative Project not found." }, { status: 404 });
  if (project.data.status !== "draft") return NextResponse.json({ error: "Only draft Creative Projects can be deleted. Archive finished work instead." }, { status: 409 });

  const publications = await service.from("pathway_publications").select("id", { count: "exact", head: true }).eq("creative_project_id", projectId);
  if (publications.error) return NextResponse.json({ error: publications.error.message }, { status: 500 });
  if ((publications.count ?? 0) > 0) return NextResponse.json({ error: "This draft already has publishing history and cannot be deleted." }, { status: 409 });

  const removed = await service.from("studio_creative_projects").delete().eq("id", projectId).eq("status", "draft").select("id").maybeSingle();
  if (removed.error) return NextResponse.json({ error: removed.error.message }, { status: 500 });
  if (!removed.data) return NextResponse.json({ error: "Draft was not deleted." }, { status: 409 });

  return NextResponse.json({ deleted: true, id: projectId, title: project.data.title });
}
