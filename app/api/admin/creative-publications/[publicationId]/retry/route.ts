import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { executePublication } from "@/creative-publication-executor";
import { createServiceClient } from "@/supabase";

export async function POST(_request: Request, context: { params: Promise<{ publicationId: string }> }) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { publicationId } = await context.params;
  if (!z.string().uuid().safeParse(publicationId).success) return NextResponse.json({ error: "Invalid publication ID." }, { status: 400 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  const current = await service.from("pathway_publications")
    .select("id,status,creative_project_id")
    .eq("id", publicationId)
    .maybeSingle();
  if (current.error) return NextResponse.json({ error: current.error.message }, { status: 500 });
  if (!current.data?.creative_project_id) return NextResponse.json({ error: "Creative publication not found." }, { status: 404 });
  if (current.data.status !== "failed") return NextResponse.json({ error: "Only failed publications can be retried." }, { status: 409 });

  const now = new Date().toISOString();
  const reset = await service.from("pathway_publications").update({ status: "scheduled", scheduled_for: now, error_message: null, updated_at: now }).eq("id", publicationId).eq("status", "failed");
  if (reset.error) return NextResponse.json({ error: reset.error.message }, { status: 500 });
  await service.from("studio_creative_projects").update({ status: "scheduled", updated_by: access.user.id, updated_at: now }).eq("id", current.data.creative_project_id);
  try {
    await executePublication(publicationId);
  } catch (error) {
    const publication = await service.from("pathway_publications").select("*").eq("id", publicationId).single();
    return NextResponse.json({ publication: publication.data, error: error instanceof Error ? error.message : "Retry failed." }, { status: 502 });
  }
  const publication = await service.from("pathway_publications").select("*").eq("id", publicationId).single();
  return NextResponse.json({ publication: publication.data });
}
