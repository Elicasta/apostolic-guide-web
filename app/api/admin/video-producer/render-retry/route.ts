import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";
import { videoProducerRenderControl, type VideoProducerRenderStatus } from "@/video-producer-render-control";

export const runtime = "nodejs";

const schema = z.object({
  projectId: z.string().uuid(),
  force: z.boolean().optional().default(false)
});

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid render recovery request." }, { status: 400 });

  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });

  const [projectResult, renderResult] = await Promise.all([
    service.from("video_producer_projects")
      .select("id,status,edit_plan,approval_fingerprint")
      .eq("id", parsed.data.projectId)
      .maybeSingle(),
    service.from("video_producer_renders")
      .select("id,status,progress,config_snapshot")
      .eq("project_id", parsed.data.projectId)
      .order("requested_at", { ascending: false })
      .limit(1)
      .maybeSingle()
  ]);

  if (projectResult.error) return NextResponse.json({ error: projectResult.error.message }, { status: 500 });
  if (renderResult.error) return NextResponse.json({ error: renderResult.error.message }, { status: 500 });
  const project = projectResult.data;
  if (!project) return NextResponse.json({ error: "Video Producer project not found." }, { status: 404 });
  if (!project.edit_plan || !project.approval_fingerprint) {
    return NextResponse.json({ error: "An approved edit is required before a render can be retried." }, { status: 409 });
  }

  const latest = renderResult.data;
  const latestStatus = latest?.status as VideoProducerRenderStatus | undefined;
  const control = videoProducerRenderControl(project.status, latestStatus, true);
  if (!control) {
    return NextResponse.json({ error: "This project does not currently have a render that can be retried." }, { status: 409 });
  }
  if (control.force && !parsed.data.force) {
    return NextResponse.json({
      error: "The current render still appears active. Confirm restart to invalidate it and launch a fresh worker.",
      code: "render_active"
    }, { status: 409 });
  }

  const now = new Date().toISOString();
  if (latest && (latest.status === "queued" || latest.status === "rendering")) {
    const snapshot = record(latest.config_snapshot);
    const bridge = record(snapshot.rendererBridge);
    const terminalSnapshot = {
      ...snapshot,
      rendererBridge: {
        ...bridge,
        callbackTokenHash: null,
        supersededAt: now,
        supersededReason: "manual_restart"
      }
    };
    const oldProgress = record(latest.progress);
    const renderUpdate = await service.from("video_producer_renders").update({
      status: "failed",
      progress: {
        percent: Number(oldProgress.percent || 0),
        stage: "Superseded by manual restart",
        heartbeatAt: now
      },
      error: "This worker was superseded by a manual render restart.",
      completed_at: now,
      config_snapshot: terminalSnapshot
    }).eq("id", latest.id);
    if (renderUpdate.error) return NextResponse.json({ error: renderUpdate.error.message }, { status: 500 });
  }

  const projectUpdate = await service.from("video_producer_projects").update({
    status: "approved",
    updated_by: access.user.id
  }).eq("id", project.id);
  if (projectUpdate.error) return NextResponse.json({ error: projectUpdate.error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    action: control.action,
    previousRenderId: latest?.id ?? null
  });
}
