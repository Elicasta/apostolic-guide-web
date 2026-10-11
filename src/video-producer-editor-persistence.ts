import type { VideoProducerEditPlan } from "./video-producer";

export const RENDER_CLAIM_STATUS = "approved";

export type EditorProjectRecord = {
  id: string;
  mode: "podcast" | "reels";
  status: string;
  edit_plan: { sourceDuration?: number; mode?: string } | null;
  updated_at: string;
  director_metadata: EditorMetadata | null;
};

export type EditorMetadata = {
  draftJob?: { status?: string };
  sceneEditor?: { version?: number; lockedScenes?: string[] };
} & Record<string, unknown>;

export type EditorSavePatch = {
  edit_plan: VideoProducerEditPlan;
  selected_music_track_id: string | null;
  status: "planned";
  approval_fingerprint: null;
  approved_at: null;
  director_metadata: EditorMetadata;
  updated_by: string;
  updated_at: string;
};

export type EditorPersistence = {
  loadProject(projectId: string): Promise<EditorProjectRecord | null>;
  saveIfUnchanged(input: {
    projectId: string;
    expectedUpdatedAt: string;
    patch: EditorSavePatch;
  }): Promise<{ updatedAt: string } | null>;
};

export type RenderClaim = {
  projectId: string;
  expectedUpdatedAt: string;
  fingerprint: string;
  userId: string;
};

export type RenderClaimStore = {
  claimApproved(input: RenderClaim): Promise<{ updatedAt: string } | null>;
};

const STALE_SAVE = "This project changed in another window. Your edits are still here. Reload the latest version before saving.";
const LOST_RACE = "This project changed while saving. Your edits have not been overwritten.";

export async function saveProducerEditorDocument(
  store: EditorPersistence,
  input: {
    projectId: string;
    expectedUpdatedAt: string;
    plan: VideoProducerEditPlan;
    lockedScenes: string[];
    userId: string;
    now?: string;
  }
): Promise<{ ok: true; updatedAt: string } | { ok: false; status: 409; error: string }> {
  const project = await store.loadProject(input.projectId);
  if (!project?.edit_plan) {
    return { ok: false, status: 409, error: "Produce a draft before editing." };
  }
  const metadata = project.director_metadata ?? {};
  if (
    ["transcribing", "directing", "rendering"].includes(project.status) ||
    metadata.draftJob?.status === "running"
  ) {
    return { ok: false, status: 409, error: "Wait for production to finish before saving changes." };
  }
  if (
    input.plan.mode !== project.mode ||
    Math.abs(input.plan.sourceDuration - Number(project.edit_plan.sourceDuration)) > 0.001
  ) {
    return { ok: false, status: 409, error: "The source changed. Reload this project before editing." };
  }
  if (project.updated_at !== input.expectedUpdatedAt) {
    return { ok: false, status: 409, error: STALE_SAVE };
  }
  const saved = await store.saveIfUnchanged({
    projectId: input.projectId,
    expectedUpdatedAt: input.expectedUpdatedAt,
    patch: {
      edit_plan: input.plan,
      selected_music_track_id: input.plan.music[0]?.trackId ?? null,
      status: "planned",
      approval_fingerprint: null,
      approved_at: null,
      director_metadata: {
        ...metadata,
        sceneEditor: { version: 1, lockedScenes: [...new Set(input.lockedScenes)] }
      },
      updated_by: input.userId,
      updated_at: input.now ?? new Date().toISOString()
    }
  });
  if (!saved) return { ok: false, status: 409, error: LOST_RACE };
  return { ok: true, updatedAt: saved.updatedAt };
}

export async function claimApprovedRender(store: RenderClaimStore, input: RenderClaim) {
  const claimed = await store.claimApproved(input);
  if (!claimed) {
    return {
      ok: false as const,
      status: 409 as const,
      error: "A render already started or the project changed. Reload the project."
    };
  }
  return { ok: true as const, updatedAt: claimed.updatedAt };
}

export function producerDownloadDecision(input: { projectFound: boolean; status: string | null; outputPath: string | null }) {
  if (!input.projectFound) return { ok: false as const, status: 404 as const, error: "Video Producer project not found." };
  if (!input.status || !["review", "completed"].includes(input.status)) {
    return { ok: false as const, status: 409 as const, error: "The master must be rendered and ready for review before it can be downloaded." };
  }
  if (!input.outputPath) return { ok: false as const, status: 404 as const, error: "No completed review master is available yet." };
  return { ok: true as const, outputPath: input.outputPath };
}
