import "server-only";
import type { ServiceClient } from "./video-producer-server";

const TRANSCRIPTION_STALE_MS = 2 * 60 * 60 * 1000;
const RENDER_STALE_MS = 4 * 60 * 60 * 1000;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function timestamp(value: unknown) {
  if (typeof value !== "string" || !value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isVideoProducerWorkerStale(value: unknown, timeoutMs: number, now = Date.now()) {
  const started = timestamp(value);
  return started != null && now - started > timeoutMs;
}

export async function reconcileVideoProducerWorkerState(service: ServiceClient, projectId: string) {
  const projectResult = await service.from("video_producer_projects")
    .select("id,status,director_metadata")
    .eq("id", projectId)
    .maybeSingle();
  if (projectResult.error || !projectResult.data) return;
  const project = projectResult.data;

  if (project.status === "transcribing") {
    const metadata = record(project.director_metadata);
    const progress = record(metadata.transcriptionProgress);
    const bridge = record(metadata.transcriptionBridge);
    const lastSignal = progress.heartbeatAt || bridge.dispatchedAt;
    if (isVideoProducerWorkerStale(lastSignal, TRANSCRIPTION_STALE_MS)) {
      const now = new Date().toISOString();
      await service.from("video_producer_projects").update({
        status: "failed",
        director_metadata: {
          ...metadata,
          transcriptionError: "Transcription worker stopped reporting progress. Retry transcription.",
          transcriptionRecoveredAt: now,
          transcriptionProgress: {
            ...progress,
            stage: "Transcription timed out",
            heartbeatAt: now
          }
        }
      }).eq("id", projectId);
    }
    return;
  }

  if (project.status !== "rendering") return;
  const renderResult = await service.from("video_producer_renders")
    .select("id,status,progress,requested_at")
    .eq("project_id", projectId)
    .in("status", ["queued", "rendering"])
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (renderResult.error || !renderResult.data) return;
  const render = renderResult.data;
  const progress = record(render.progress);
  const lastSignal = progress.heartbeatAt || render.requested_at;
  if (!isVideoProducerWorkerStale(lastSignal, RENDER_STALE_MS)) return;

  const now = new Date().toISOString();
  const error = "Render worker stopped reporting progress. The approved edit is preserved and can be rendered again.";
  await Promise.all([
    service.from("video_producer_renders").update({
      status: "failed",
      progress: { ...progress, stage: "Render timed out", heartbeatAt: now },
      error,
      completed_at: now
    }).eq("id", render.id),
    service.from("video_producer_projects").update({ status: "approved" }).eq("id", projectId)
  ]);
}
