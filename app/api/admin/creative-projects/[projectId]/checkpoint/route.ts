import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { createCreativeCheckpoint, loadCreativeProject } from "@/creative-project-server";
import { createServiceClient } from "@/supabase";

const schema = z.object({ changeSummary: z.string().trim().max(500).optional().default("") });

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { projectId } = await context.params;
  if (!z.string().uuid().safeParse(projectId).success) return NextResponse.json({ error: "Invalid project ID." }, { status: 400 });
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid checkpoint." }, { status: 400 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  try {
    const project = await loadCreativeProject(service, projectId);
    if (!project) return NextResponse.json({ error: "Creative Project not found." }, { status: 404 });
    const revision = await createCreativeCheckpoint(service, project, access.user.id, { reason: "checkpoint", changeSummary: parsed.data.changeSummary });
    return NextResponse.json({ revision });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Checkpoint could not be saved." }, { status: 500 });
  }
}
