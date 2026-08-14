import { NextResponse } from "next/server";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";

export const runtime = "nodejs";

export async function GET() {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });

  const [projectsResult, rendersResult] = await Promise.all([
    service.from("video_producer_projects")
      .select("id,title,mode,status,parent_project_id,source_filename,source_duration,source_range_start,source_range_end,approval_fingerprint,created_at,updated_at")
      .order("updated_at", { ascending: false })
      .limit(100),
    service.from("video_producer_renders")
      .select("id,project_id,status,progress,error,requested_at,started_at,completed_at")
      .order("requested_at", { ascending: false })
      .limit(300)
  ]);

  if (projectsResult.error) return NextResponse.json({ error: projectsResult.error.message }, { status: 500 });
  if (rendersResult.error) return NextResponse.json({ error: rendersResult.error.message }, { status: 500 });

  const latestByProject = new Map<string, unknown>();
  for (const render of rendersResult.data ?? []) {
    if (!latestByProject.has(render.project_id)) latestByProject.set(render.project_id, render);
  }

  const projects = (projectsResult.data ?? []).map((project) => ({
    ...project,
    latest_render: latestByProject.get(project.id) ?? null
  }));

  return NextResponse.json({ projects });
}
