import { NextResponse } from "next/server";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";
import { createPrivateBlobDownloadUrl } from "@/video-producer-server";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Invalid project id." }, { status: 400 });

  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });

  const [projectResult, renderResult] = await Promise.all([
    service.from("video_producer_projects").select("id,status").eq("id", id).maybeSingle(),
    service.from("video_producer_renders")
      .select("id,status,output_storage_path,completed_at")
      .eq("project_id", id)
      .eq("status", "completed")
      .not("output_storage_path", "is", null)
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle()
  ]);

  if (projectResult.error) return NextResponse.json({ error: projectResult.error.message }, { status: 500 });
  if (renderResult.error) return NextResponse.json({ error: renderResult.error.message }, { status: 500 });
  if (!projectResult.data) return NextResponse.json({ error: "Video Producer project not found." }, { status: 404 });
  if (!["review", "completed"].includes(projectResult.data.status)) {
    return NextResponse.json({ error: "The master must be rendered and ready for review before it can be downloaded." }, { status: 409 });
  }

  const render = renderResult.data;
  if (!render?.output_storage_path) return NextResponse.json({ error: "No completed review master is available yet." }, { status: 404 });

  try {
    const signedUrl = await createPrivateBlobDownloadUrl(render.output_storage_path, 10 * 60 * 1000);
    return NextResponse.redirect(signedUrl, { status: 302, headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    console.error("Video Producer download signing failed", error);
    return NextResponse.json({ error: "The private download link could not be created." }, { status: 500 });
  }
}
