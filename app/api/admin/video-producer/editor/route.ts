import { NextResponse } from "next/server";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";
import { producerEditorSaveSchema } from "@/video-producer-editor";

export const runtime = "nodejs";

export async function PATCH(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = producerEditorSaveSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid edit." },
      { status: 400 },
    );
  const service = createServiceClient();
  if (!service)
    return NextResponse.json(
      { error: "Project storage is unavailable." },
      { status: 503 },
    );
  const { projectId, expectedUpdatedAt, plan, lockedScenes } = parsed.data;
  const result = await service
    .from("video_producer_projects")
    .select("id,mode,status,edit_plan,updated_at,director_metadata")
    .eq("id", projectId)
    .is("deleted_at", null)
    .maybeSingle();
  if (result.error)
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  const project = result.data;
  if (!project?.edit_plan)
    return NextResponse.json(
      { error: "Produce a draft before editing." },
      { status: 409 },
    );
  if (
    ["transcribing", "directing", "rendering"].includes(project.status) ||
    project.director_metadata?.draftJob?.status === "running"
  )
    return NextResponse.json(
      { error: "Wait for production to finish before saving changes." },
      { status: 409 },
    );
  if (
    plan.mode !== project.mode ||
    Math.abs(plan.sourceDuration - Number(project.edit_plan.sourceDuration)) >
      0.001
  )
    return NextResponse.json(
      { error: "The source changed. Reload this project before editing." },
      { status: 409 },
    );
  if (project.updated_at !== expectedUpdatedAt)
    return NextResponse.json(
      {
        error:
          "This project changed in another window. Your edits are still here. Reload the latest version before saving.",
      },
      { status: 409 },
    );
  const metadata =
    project.director_metadata && typeof project.director_metadata === "object"
      ? project.director_metadata
      : {};
  const update = await service
    .from("video_producer_projects")
    .update({
      edit_plan: plan,
      selected_music_track_id: plan.music[0]?.trackId ?? null,
      status: "planned",
      approval_fingerprint: null,
      approved_at: null,
      director_metadata: {
        ...metadata,
        sceneEditor: { version: 1, lockedScenes: [...new Set(lockedScenes)] },
      },
      updated_by: access.user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId)
    .eq("updated_at", expectedUpdatedAt)
    .is("deleted_at", null)
    .select("updated_at")
    .maybeSingle();
  if (update.error)
    return NextResponse.json({ error: update.error.message }, { status: 500 });
  if (!update.data)
    return NextResponse.json(
      {
        error:
          "This project changed while saving. Your edits have not been overwritten.",
      },
      { status: 409 },
    );
  return NextResponse.json({ updatedAt: update.data.updated_at });
}
