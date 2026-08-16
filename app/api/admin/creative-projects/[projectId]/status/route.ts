import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { CREATIVE_STATUSES, assertCreativeStatusTransition } from "@/creative-project";
import { creativeProjectFromRow, loadCreativeProject } from "@/creative-project-server";
import { createServiceClient } from "@/supabase";

const schema = z.object({ status: z.enum(CREATIVE_STATUSES) });

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { projectId } = await context.params;
  if (!z.string().uuid().safeParse(projectId).success) return NextResponse.json({ error: "Invalid project ID." }, { status: 400 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid Creative Project status." }, { status: 400 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  try {
    const current = await loadCreativeProject(service, projectId);
    if (!current) return NextResponse.json({ error: "Creative Project not found." }, { status: 404 });
    assertCreativeStatusTransition(current.status, parsed.data.status);
    const now = new Date().toISOString();
    const saved = await service.from("studio_creative_projects").update({
      status: parsed.data.status,
      ...(parsed.data.status === "published" ? { published_at: current.publishedAt ?? now } : {}),
      updated_by: access.user.id,
      updated_at: now
    }).eq("id", projectId).select("*").single();
    if (saved.error) return NextResponse.json({ error: saved.error.message }, { status: 500 });
    return NextResponse.json({ project: creativeProjectFromRow(saved.data as Record<string, unknown>) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Status could not be changed." }, { status: 409 });
  }
}
