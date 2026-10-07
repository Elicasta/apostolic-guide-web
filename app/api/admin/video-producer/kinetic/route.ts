import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";
import type { VideoProducerEditPlan, VideoProducerKineticTreatment } from "@/video-producer";

export const runtime = "nodejs";

const treatment = z.enum(["impact", "split", "strike", "band", "stack", "question-stack"]);
const patchSchema = z.object({
  projectId: z.string().uuid(),
  overlayId: z.string().min(1).max(160),
  title: z.string().min(1).max(120).optional(),
  body: z.string().max(320).nullable().optional(),
  treatment: treatment.optional(),
  start: z.number().min(0).optional(),
  duration: z.number().min(0.5).max(15).optional()
});

function kineticRows(plan: VideoProducerEditPlan | null | undefined) {
  if (!plan) return [];
  return plan.overlays
    .filter((overlay) => overlay.kind === "kinetic")
    .map((overlay) => ({
      id: overlay.id,
      start: overlay.start,
      duration: overlay.duration,
      title: overlay.title,
      body: overlay.body ?? null,
      treatment: (overlay.treatment ?? "impact") as VideoProducerKineticTreatment,
      animation: overlay.animation ?? "pop",
      placement: overlay.placement ?? "full-frame"
    }))
    .sort((a, b) => a.start - b.start);
}

export async function GET(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const projectId = new URL(request.url).searchParams.get("projectId");
  if (!projectId || !/^[0-9a-f-]{36}$/i.test(projectId)) return NextResponse.json({ error: "projectId is required." }, { status: 400 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });
  const result = await service.from("video_producer_projects")
    .select("id,title,status,edit_plan,approval_fingerprint")
    .eq("id", projectId).is("deleted_at", null).maybeSingle();
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
  if (!result.data) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const plan = result.data.edit_plan as VideoProducerEditPlan | null;
  return NextResponse.json({
    project: { id: result.data.id, title: result.data.title, status: result.data.status, approved: Boolean(result.data.approval_fingerprint) },
    kinetics: kineticRows(plan)
  });
}

export async function PATCH(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid kinetic graphic update." }, { status: 400 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });

  const result = await service.from("video_producer_projects")
    .select("id,status,source_duration,edit_plan")
    .eq("id", parsed.data.projectId).is("deleted_at", null).maybeSingle();
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
  if (!result.data?.edit_plan) return NextResponse.json({ error: "Producer plan not found." }, { status: 404 });
  if (result.data.status === "rendering") return NextResponse.json({ error: "Wait for the current render before changing kinetic graphics." }, { status: 409 });

  const plan = result.data.edit_plan as VideoProducerEditPlan;
  const index = plan.overlays.findIndex((overlay) => overlay.id === parsed.data.overlayId && overlay.kind === "kinetic");
  if (index < 0) return NextResponse.json({ error: "Kinetic graphic not found." }, { status: 404 });

  const current = plan.overlays[index];
  const maxDuration = Math.max(0, Number(plan.sourceDuration || result.data.source_duration || 0));
  const nextStart = parsed.data.start ?? current.start;
  const nextDuration = parsed.data.duration ?? current.duration;
  if (maxDuration > 0 && nextStart >= maxDuration) return NextResponse.json({ error: "Kinetic graphic starts outside the source timeline." }, { status: 409 });
  const boundedDuration = maxDuration > 0 ? Math.min(nextDuration, Math.max(0.5, maxDuration - nextStart)) : nextDuration;

  plan.overlays[index] = {
    ...current,
    title: parsed.data.title?.replace(/\s+/g, " ").trim() || current.title,
    body: parsed.data.body === undefined ? current.body : (parsed.data.body?.replace(/\s+/g, " ").trim() || undefined),
    treatment: parsed.data.treatment ?? current.treatment ?? "impact",
    start: nextStart,
    duration: boundedDuration,
    placement: "full-frame",
    animation: current.animation ?? "pop"
  };

  const update = await service.from("video_producer_projects").update({
    edit_plan: plan,
    approval_fingerprint: null,
    approved_at: null,
    ...(result.data.status === "approved" ? { status: "planned" } : {}),
    updated_by: access.user.id
  }).eq("id", result.data.id).select("id,status,edit_plan,approval_fingerprint").single();
  if (update.error) return NextResponse.json({ error: update.error.message }, { status: 500 });
  return NextResponse.json({
    project: { id: update.data.id, status: update.data.status, approved: Boolean(update.data.approval_fingerprint) },
    kinetics: kineticRows(update.data.edit_plan as VideoProducerEditPlan)
  });
}
