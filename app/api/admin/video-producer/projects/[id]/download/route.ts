import { NextResponse } from "next/server";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";
import { producerDownloadDecision } from "@/video-producer-editor-persistence";
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
  const decision = producerDownloadDecision({
    projectFound: Boolean(projectResult.data),
    status: projectResult.data?.status ?? null,
    outputPath: renderResult.data?.output_storage_path ?? null
  });
  if (!decision.ok) return NextResponse.json({ error: decision.error }, { status: decision.status });

  try {
    const signedUrl = await createPrivateBlobDownloadUrl(decision.outputPath, 10 * 60 * 1000);
    return NextResponse.redirect(signedUrl, { status: 302, headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    console.error("Video Producer download signing failed", error);
    return NextResponse.json({ error: "The private download link could not be created." }, { status: 500 });
  }
}
