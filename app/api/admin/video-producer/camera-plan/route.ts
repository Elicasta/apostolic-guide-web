import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";
import {
  mediaLocalCoverage,
  normalizeVideoProducerCameraPlan,
  type VideoProducerCameraPlan
} from "@/video-producer-multicam";

export const runtime = "nodejs";

const decisionSchema = z.object({
  id: z.string().trim().min(1).max(120),
  at: z.number().finite().min(0),
  camera: z.enum(["A", "B"]),
  reason: z.string().trim().max(280).optional(),
  source: z.enum(["auto", "manual"]),
  locked: z.boolean()
});

const schema = z.object({
  projectId: z.string().uuid(),
  decisions: z.array(decisionSchema).max(120)
});

export async function PATCH(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid camera plan." }, { status: 400 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });

  const projectResult = await service.from("video_producer_projects")
    .select("id,parent_project_id,source_duration,source_range_start,source_range_end,transcript,camera_plan")
    .eq("id", parsed.data.projectId).is("deleted_at", null).maybeSingle();
  if (projectResult.error) return NextResponse.json({ error: projectResult.error.message }, { status: 500 });
  const project = projectResult.data;
  if (!project) return NextResponse.json({ error: "Video Producer project not found." }, { status: 404 });
  const rootId = project.parent_project_id || project.id;
  const cameraBResult = await service.from("video_producer_media_assets")
    .select("id,duration,sync_status,offset_seconds,revision")
    .eq("project_id", rootId).eq("role", "camera_b").eq("active", true).maybeSingle();
  if (cameraBResult.error) return NextResponse.json({ error: cameraBResult.error.message }, { status: 500 });
  const cameraB = cameraBResult.data;
  if (!cameraB || !["synced", "manual"].includes(cameraB.sync_status) || cameraB.duration == null || cameraB.offset_seconds == null) {
    return NextResponse.json({ error: "Camera B must be synchronized before editing the Camera Plan." }, { status: 409 });
  }
  const duration = project.source_range_start != null && project.source_range_end != null
    ? Number(project.source_range_end) - Number(project.source_range_start)
    : Number(project.source_duration || 0);
  if (duration <= 0) return NextResponse.json({ error: "Project duration is not available." }, { status: 409 });
  const coverage = mediaLocalCoverage(
    Number(cameraB.duration),
    Number(cameraB.offset_seconds),
    Number(project.source_range_start || 0),
    project.source_range_end != null ? Number(project.source_range_end) : null
  );
  if (!coverage) return NextResponse.json({ error: "Camera B does not overlap this project range." }, { status: 409 });

  const manualized = parsed.data.decisions.map((decision) => ({ ...decision, source: decision.source === "auto" && decision.locked ? "manual" as const : decision.source }));
  const nextPlan: VideoProducerCameraPlan = normalizeVideoProducerCameraPlan({
    version: 1,
    defaultCamera: "A",
    decisions: manualized,
    generatedAt: (project.camera_plan as VideoProducerCameraPlan | null)?.generatedAt,
    sourceRevision: Number(cameraB.revision || 1)
  }, duration, coverage);
  const update = await service.from("video_producer_projects").update({
    camera_plan: nextPlan,
    approval_fingerprint: null,
    approved_at: null,
    status: "planned",
    updated_by: access.user.id
  }).eq("id", project.id).select("*").single();
  if (update.error) return NextResponse.json({ error: update.error.message }, { status: 500 });
  return NextResponse.json({ project: update.data, cameraPlan: nextPlan, coverage });
}
