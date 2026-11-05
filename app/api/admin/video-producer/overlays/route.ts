import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";
import { recordStudioAudit } from "@/studio-audit";
import { correctScriptureOverlays } from "@/video-producer-scripture";
import type { VideoProducerEditPlan } from "@/video-producer";

export const runtime = "nodejs";

const base = {
  projectId: z.string().uuid(),
  expectedUpdatedAt: z.string().min(8).max(80)
};
const patchSchema = z.discriminatedUnion("action", [
  z.object({ ...base, action: z.literal("correct-scripture") }),
  z.object({
    ...base, action: z.literal("edit-overlay"),
    overlayId: z.string().min(1).max(100),
    title: z.string().trim().min(1).max(1500),
    body: z.string().trim().max(1000).optional()
  })
]);

export async function PATCH(request: Request) {
  const { access } = await getStudioPermission("manage_content");
  if (access.state !== "allowed" || access.role !== "owner" || !access.user)
    return NextResponse.json({ error: "Only the owner can edit production overlays." }, { status: 403 });
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid overlay edit request." }, { status: 400 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Doctrine storage unavailable." }, { status: 503 });

  const input = parsed.data;
  const result = await service.from("video_producer_projects")
    .select("id,status,edit_plan,updated_at")
    .eq("id", input.projectId).is("deleted_at", null).maybeSingle();
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
  const project = result.data;
  if (!project) return NextResponse.json({ error: "Video project not found." }, { status: 404 });
  if (!["draft", "planned"].includes(project.status))
    return NextResponse.json({ error: "Only unapproved drafts can change overlays." }, { status: 409 });
  if (project.updated_at !== input.expectedUpdatedAt)
    return NextResponse.json({ error: "Project changed. Reload before editing overlays." }, { status: 409 });

  const plan = project.edit_plan as VideoProducerEditPlan | null;
  if (!plan || !Array.isArray(plan.overlays))
    return NextResponse.json({ error: "Save an edit plan before changing overlays." }, { status: 409 });
  let nextPlan: VideoProducerEditPlan;
  try {
    if (input.action === "correct-scripture") {
      nextPlan = correctScriptureOverlays(plan);
    } else {
      if (!plan.overlays.some((overlay) => overlay.id === input.overlayId))
        return NextResponse.json({ error: "Overlay not found in this project." }, { status: 404 });
      nextPlan = {
        ...plan, overlays: plan.overlays.map((overlay) => overlay.id === input.overlayId
          ? { ...overlay, title: input.title, body: input.body || undefined } : overlay)
      };
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "KJV correction failed." }, { status: 422 });
  }
  if (JSON.stringify(plan) === JSON.stringify(nextPlan)) return NextResponse.json({ unchanged: true, project });

  const audited = await recordStudioAudit({
    actorUserId: access.user.id,
    action: input.action === "correct-scripture" ? "video.scripture_corrected" : "video.overlay_edited",
    resourceType: "video_clip", resourceId: project.id,
    metadata: { action: input.action, overlayId: input.action === "edit-overlay" ? input.overlayId : null }
  });
  if (!audited) return NextResponse.json({ error: "Audit log unavailable. Nothing was changed." }, { status: 503 });

  const saved = await service.from("video_producer_projects").update({
    edit_plan: nextPlan, updated_by: access.user.id, updated_at: new Date().toISOString(),
    status: "planned", approval_fingerprint: null, approved_at: null
  }).eq("id", project.id).eq("updated_at", input.expectedUpdatedAt)
    .in("status", ["draft", "planned"]).is("deleted_at", null)
    .select("id,edit_plan,updated_at").maybeSingle();
  if (saved.error) return NextResponse.json({ error: saved.error.message }, { status: 500 });
  if (!saved.data) return NextResponse.json({ error: "Project changed during save. Reload and retry." }, { status: 409 });
  // The source hash incorporates the persisted plan, so an old verdict and
  // owner override can never authorize newly edited text.
  return NextResponse.json({ project: saved.data, doctrineState: "not_checked" });
}
