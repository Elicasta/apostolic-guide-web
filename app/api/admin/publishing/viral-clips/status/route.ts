import { NextResponse } from "next/server";
import { getStudioPermission } from "@/auth";
import { pathwayBySlug } from "@/pathway-catalog";
import { createServiceClient } from "@/supabase";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { access, allowed } = await getStudioPermission("view_distribution");
  if (!allowed || access.state !== "allowed") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(request.url);
  const slug = url.searchParams.get("slug")?.trim() || "";
  const pathway = pathwayBySlug(slug);
  if (!pathway) return NextResponse.json({ error: "Pathway not found." }, { status: 404 });

  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });

  const result = await service.from("pathway_social_clips")
    .select("id,pathway_slug,source_render_id,asset_id,platform,rank,score,start_seconds,end_seconds,hook,title,rationale,caption,status,output_url,error,model,analysis_metadata,created_at,completed_at,updated_at")
    .eq("pathway_slug", pathway.slug)
    .neq("status", "archived")
    .order("rank", { ascending: true })
    .order("created_at", { ascending: false });

  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
  return NextResponse.json({ clips: result.data ?? [] }, { headers: { "cache-control": "no-store" } });
}
