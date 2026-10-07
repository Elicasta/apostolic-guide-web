import { NextResponse } from "next/server";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";
import { producerEditorSaveSchema } from "@/video-producer-editor";
import {
  saveProducerEditorDocument,
  type EditorMetadata,
  type EditorProjectRecord
} from "@/video-producer-editor-persistence";

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
  try {
    const saved = await saveProducerEditorDocument(
      {
        async loadProject(id) {
          const result = await service
            .from("video_producer_projects")
            .select("id,mode,status,edit_plan,updated_at,director_metadata")
            .eq("id", id)
            .is("deleted_at", null)
            .maybeSingle();
          if (result.error) throw new Error(result.error.message);
          return (result.data as EditorProjectRecord | null) ?? null;
        },
        async saveIfUnchanged(input) {
          const update = await service
            .from("video_producer_projects")
            .update({
              edit_plan: input.patch.edit_plan,
              selected_music_track_id: input.patch.selected_music_track_id,
              status: input.patch.status,
              approval_fingerprint: input.patch.approval_fingerprint,
              approved_at: input.patch.approved_at,
              director_metadata: input.patch.director_metadata as EditorMetadata,
              updated_by: input.patch.updated_by,
              updated_at: input.patch.updated_at
            })
            .eq("id", input.projectId)
            .eq("updated_at", input.expectedUpdatedAt)
            .is("deleted_at", null)
            .select("updated_at")
            .maybeSingle();
          if (update.error) throw new Error(update.error.message);
          return update.data ? { updatedAt: update.data.updated_at } : null;
        }
      },
      {
        projectId,
        expectedUpdatedAt,
        plan,
        lockedScenes,
        userId: access.user.id
      }
    );
    if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: saved.status });
    return NextResponse.json({ updatedAt: saved.updatedAt });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Edit could not be saved." },
      { status: 500 }
    );
  }
}
