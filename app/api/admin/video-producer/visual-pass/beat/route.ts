import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";

export const runtime = "nodejs";

const schema = z.object({
  beatId: z.string().uuid(),
  status: z.enum(["open", "skipped"]).optional(),
  recommendation: z.enum(["a-roll", "punch-in", "camera-b", "scripture", "graphic", "b-roll"]).optional()
}).refine((value) => value.status !== undefined || value.recommendation !== undefined, "No change requested.");

export async function PATCH(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid beat update." }, { status: 400 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });

  const beatResult = await service.from("video_producer_visual_beats").select("id,project_id,status,recommendation,revision").eq("id", parsed.data.beatId).maybeSingle();
  if (beatResult.error) return NextResponse.json({ error: beatResult.error.message }, { status: 500 });
  if (!beatResult.data) return NextResponse.json({ error: "Visual beat not found." }, { status: 404 });
  const projectResult = await service.from("video_producer_projects").select("status").eq("id", beatResult.data.project_id).maybeSingle();
  if (projectResult.error) return NextResponse.json({ error: projectResult.error.message }, { status: 500 });
  if (projectResult.data?.status === "rendering") return NextResponse.json({ error: "Wait for the current render before changing visuals." }, { status: 409 });

  const updates: Record<string, unknown> = {
    updated_by: access.user.id,
    revision: Number(beatResult.data.revision || 1) + 1
  };
  if (parsed.data.status !== undefined) updates.status = parsed.data.status;
  if (parsed.data.recommendation !== undefined) updates.recommendation = parsed.data.recommendation;
  if (parsed.data.recommendation && parsed.data.recommendation !== "b-roll" && parsed.data.status === undefined) updates.status = "resolved";
  if (parsed.data.recommendation === "b-roll" && parsed.data.status === undefined) updates.status = "open";

  const shouldRemovePlacement = parsed.data.status === "skipped" || (parsed.data.recommendation !== undefined && parsed.data.recommendation !== "b-roll");
  if (shouldRemovePlacement) {
    const disabled = await service.from("video_producer_visual_placements").update({ active: false, updated_by: access.user.id }).eq("beat_id", beatResult.data.id).eq("active", true);
    if (disabled.error) return NextResponse.json({ error: disabled.error.message }, { status: 500 });
  }

  const saved = await service.from("video_producer_visual_beats").update(updates).eq("id", beatResult.data.id).select("*").single();
  if (saved.error) return NextResponse.json({ error: saved.error.message }, { status: 500 });

  if (shouldRemovePlacement) {
    const projectUpdate = await service.from("video_producer_projects").update({
      approval_fingerprint: null,
      approved_at: null,
      ...(projectResult.data?.status === "approved" ? { status: "planned" } : {}),
      updated_by: access.user.id
    }).eq("id", beatResult.data.project_id);
    if (projectUpdate.error) return NextResponse.json({ error: projectUpdate.error.message }, { status: 500 });
  }

  return NextResponse.json({ beat: saved.data });
}
