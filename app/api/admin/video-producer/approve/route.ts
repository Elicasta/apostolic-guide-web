import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";
import { compileVideoProducerRenderPlan, type VideoProducerEditPlan } from "@/video-producer";
import { videoProducerPlanFingerprint } from "@/video-producer-server";

export const runtime = "nodejs";

const schema = z.object({ projectId: z.string().uuid() });

export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid approval request." }, { status: 400 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });
  const project = await service.from("video_producer_projects").select("id,mode,status,edit_plan").eq("id", parsed.data.projectId).maybeSingle();
  if (project.error) return NextResponse.json({ error: project.error.message }, { status: 500 });
  if (!project.data?.edit_plan || (project.data.mode !== "podcast" && project.data.mode !== "reels")) return NextResponse.json({ error: "Generate an edit plan before approval." }, { status: 409 });
  let plan: VideoProducerEditPlan;
  try {
    plan = project.data.edit_plan as VideoProducerEditPlan;
    const compiled = compileVideoProducerRenderPlan(plan);
    if (plan.version !== 2 || plan.mode !== project.data.mode || compiled.outputDuration <= 0 || !compiled.keepSegments.length) throw new Error("Edit plan is not renderable.");
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Edit plan is invalid." }, { status: 422 });
  }
  const fingerprint = videoProducerPlanFingerprint(plan);
  const now = new Date().toISOString();
  const update = await service.from("video_producer_projects").update({
    status: "approved",
    approval_fingerprint: fingerprint,
    approved_at: now,
    updated_by: access.user.id
  }).eq("id", project.data.id).select("*").single();
  if (update.error) return NextResponse.json({ error: update.error.message }, { status: 500 });
  return NextResponse.json({ project: update.data, fingerprint });
}
