import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";
import {
  createCreativeCheckpoint,
  creativeProjectFromRow,
  creativeProjectUpdatePayload,
  loadCreativeProject,
} from "@/creative-project-server";
import { fromCodeJson, toCodeJson } from "@/carousel-code";
export async function PUT(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { projectId } = await context.params;
  if (!z.string().uuid().safeParse(projectId).success)
    return NextResponse.json({ error: "Invalid project ID" }, { status: 400 });
  const service = createServiceClient();
  if (!service)
    return NextResponse.json(
      { error: "Supabase is not configured" },
      { status: 503 },
    );
  try {
    const body = await request.json();
    let next = body.carousel ? fromCodeJson(body.carousel) : null;
    const current = await loadCreativeProject(service, projectId);
    if (!current)
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (current.status !== "draft")
      return NextResponse.json(
        {
          error:
            "Code Mode only changes drafts. Return this project to Draft first.",
        },
        { status: 409 },
      );
    if (body.expectedStateVersion !== current.stateVersion)
      return NextResponse.json(
        {
          error:
            "This draft changed in another editor. Reload before applying.",
        },
        { status: 409 },
      );
    if (body.revisionId) {
      if (!z.string().uuid().safeParse(body.revisionId).success)
        throw new Error("Invalid revision ID");
      const revision = await service
        .from("studio_creative_project_revisions")
        .select("snapshot")
        .eq("id", body.revisionId)
        .eq("project_id", projectId)
        .single();
      if (revision.error) throw new Error(revision.error.message);
      const snap = revision.data.snapshot;
      next = fromCodeJson(toCodeJson(snap.title, snap.editorState));
      next.visualSettings.codeMode.enabled = Boolean(
        snap.editorState.visualSettings.codeMode?.enabled,
      );
    }
    if (!next) throw new Error("Provide carousel JSON or a revision ID");
    if (current.format === "single" && next.frames.length !== 1)
      return NextResponse.json(
        {
          error:
            "Single Post requires exactly one frame. Use a carousel project for multiple slides.",
        },
        { status: 400 },
      );
    // Save the pre-Apply snapshot first. A failed save leaves an extra safe revision, never lost content.
    await createCreativeCheckpoint(service, current, access.user.id, {
      changeSummary: "Before Code Mode Apply",
    });
    const editorState = {
      ...current.editorState,
      frames: next.frames,
      visualSettings: next.visualSettings,
    };
    const payload = creativeProjectUpdatePayload({
      ...current,
      title: next.title,
      editorState,
    });
    const updated = await service
      .from("studio_creative_projects")
      .update({
        ...payload,
        state_version: current.stateVersion + 1,
        updated_by: access.user.id,
        last_autosaved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", projectId)
      .eq("status", "draft")
      .eq("state_version", current.stateVersion)
      .select("*")
      .maybeSingle();
    if (updated.error) throw new Error(updated.error.message);
    if (!updated.data)
      return NextResponse.json(
        {
          error:
            "Draft changed while applying. Reload; your previous version was preserved.",
        },
        { status: 409 },
      );
    return NextResponse.json({ project: creativeProjectFromRow(updated.data) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Invalid Code Mode JSON" },
      { status: 400 },
    );
  }
}
