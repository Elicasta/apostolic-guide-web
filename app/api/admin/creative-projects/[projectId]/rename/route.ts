import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { creativeProjectFromRow } from "@/creative-project-server";
import { createServiceClient } from "@/supabase";

const renameSchema = z.object({ title: z.string().trim().min(1).max(180) });

export async function PATCH(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { projectId } = await context.params;
  if (!z.string().uuid().safeParse(projectId).success) return NextResponse.json({ error: "Invalid project ID." }, { status: 400 });
  const parsed = renameSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid project title." }, { status: 400 });

  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  const current = await service.from("studio_creative_projects").select("id,search_text").eq("id", projectId).maybeSingle();
  if (current.error) return NextResponse.json({ error: current.error.message }, { status: 500 });
  if (!current.data) return NextResponse.json({ error: "Creative Project not found." }, { status: 404 });

  const now = new Date().toISOString();
  const renamed = await service.from("studio_creative_projects").update({
    title: parsed.data.title,
    search_text: `${parsed.data.title} ${String(current.data.search_text || "")}`.trim(),
    updated_by: access.user.id,
    updated_at: now
  }).eq("id", projectId).select("*").single();

  if (renamed.error) return NextResponse.json({ error: renamed.error.message }, { status: 500 });
  return NextResponse.json({ project: creativeProjectFromRow(renamed.data as Record<string, unknown>) });
}
