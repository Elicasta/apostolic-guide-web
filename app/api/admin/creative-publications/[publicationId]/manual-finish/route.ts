import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";

const schema = z.object({
  publishedUrl: z.string().url().max(1000).optional().nullable(),
  externalPostId: z.string().trim().max(300).optional().nullable()
});

export async function POST(request: Request, context: { params: Promise<{ publicationId: string }> }) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { publicationId } = await context.params;
  if (!z.string().uuid().safeParse(publicationId).success) return NextResponse.json({ error: "Invalid publication ID." }, { status: 400 });
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid completion details." }, { status: 400 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  const current = await service.from("pathway_publications").select("id,status,creative_project_id").eq("id", publicationId).maybeSingle();
  if (current.error) return NextResponse.json({ error: current.error.message }, { status: 500 });
  if (!current.data?.creative_project_id) return NextResponse.json({ error: "Creative publication not found." }, { status: 404 });
  if (current.data.status !== "needs_manual_finish") return NextResponse.json({ error: "This publication is not waiting for manual finish." }, { status: 409 });
  const now = new Date().toISOString();
  const [publication, project] = await Promise.all([
    service.from("pathway_publications").update({
      status: "published",
      published_url: parsed.data.publishedUrl ?? null,
      external_post_id: parsed.data.externalPostId ?? null,
      published_at: now,
      error_message: null,
      updated_at: now
    }).eq("id", publicationId).select("*").single(),
    service.from("studio_creative_projects").update({ status: "published", published_at: now, updated_by: access.user.id, updated_at: now }).eq("id", current.data.creative_project_id)
  ]);
  const error = publication.error || project.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ publication: publication.data });
}
