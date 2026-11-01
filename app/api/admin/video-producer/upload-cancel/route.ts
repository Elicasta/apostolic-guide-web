import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";

export const runtime = "nodejs";

const schema = z.object({ projectId: z.string().uuid() });

export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid project." }, { status: 400 });

  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Video Producer storage is unavailable." }, { status: 503 });

  const project = await service.from("video_producer_projects")
    .select("id,status,parent_project_id")
    .eq("id", parsed.data.projectId)
    .maybeSingle();
  if (project.error) return NextResponse.json({ error: project.error.message }, { status: 500 });
  if (!project.data) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  if (project.data.parent_project_id) return NextResponse.json({ error: "Inherited reel sources cannot be cancelled." }, { status: 409 });
  if (project.data.status !== "uploading") {
    return NextResponse.json({ ok: true, state: project.data.status });
  }

  const update = await service.from("video_producer_projects").update({
    status: "draft",
    source_provider: "vercel_blob",
    source_locator: null,
    source_storage_path: null,
    source_filename: null,
    source_mime_type: null,
    source_size_bytes: null,
    source_duration: null,
    transcript_text: null,
    transcript: { words: [], segments: [] },
    edit_plan: null,
    approval_fingerprint: null,
    approved_at: null,
    director_metadata: {},
    reel_candidates: [],
    updated_by: access.user.id
  }).eq("id", project.data.id).eq("status", "uploading");
  if (update.error) return NextResponse.json({ error: update.error.message }, { status: 500 });

  return NextResponse.json({ ok: true, state: "draft" });
}
