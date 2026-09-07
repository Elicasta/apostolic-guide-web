import "server-only";
import { randomUUID } from "node:crypto";
import { createServiceClient } from "@/supabase";
import { runProducerTranscribe } from "@/video-producer-operation-transcribe";
import { runProducerDirect } from "@/video-producer-operation-direct";
import { runProducerVisualPlan } from "@/video-producer-operation-visual-pass";
import { runProducerVisualSearch } from "@/video-producer-operation-visual-pass-search";
import { runProducerVisualUse } from "@/video-producer-operation-visual-pass-use";

export type ProducerDraftJob = {
  id: string;
  status: "running" | "completed" | "failed";
  userId: string;
  origin: string;
  environment: string;
  message: string;
  startedAt: string;
  updatedAt: string;
  lease?: string;
  leaseUntil?: string;
  attemptedBeats: string[];
  error?: string;
};
const LEASE_MS = 10 * 60 * 1000;
type Service = NonNullable<ReturnType<typeof createServiceClient>>;
async function project(service: Service, id: string) {
  const result = await service
    .from("video_producer_projects")
    .select(
      "id,status,source_locator,transcript_text,edit_plan,director_metadata,updated_at",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
async function invoke<T>(
  operation: (request: Request, userId: string) => Promise<Response>,
  body: unknown,
  job: ProducerDraftJob,
): Promise<T> {
  // This entry point is server-only. The runner constructs all IDs from its claimed project.
  // No browser headers, cookies, tokens, or caller-provided user IDs grant internal access.
  const result = await operation(
    new Request(`${job.origin}/api/admin/video-producer/draft`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    job.userId,
  );
  const data = await result.json();
  if (!result.ok) throw new Error(data.error || "Draft production failed.");
  return data as T;
}

export async function startProducerDraft(
  projectId: string,
  userId: string,
  origin: string,
) {
  const service = createServiceClient();
  if (!service) throw new Error("Project storage is unavailable.");
  const current = await project(service, projectId);
  if (!current?.source_locator) throw new Error("Upload your recording first.");
  const old = current.director_metadata?.draftJob as
    | ProducerDraftJob
    | undefined;
  if (old?.status === "running") return old;
  if (["rendering", "directing"].includes(current.status))
    throw new Error("Wait for the current production job to finish.");
  const now = new Date().toISOString();
  const job: ProducerDraftJob = {
    id: randomUUID(),
    status: "running",
    userId,
    origin,
    environment: process.env.VERCEL_ENV || "development",
    startedAt: now,
    updatedAt: now,
    attemptedBeats: [],
    message: "Preparing your recording…",
  };
  const saved = await service
    .from("video_producer_projects")
    .update({
      director_metadata: { ...current.director_metadata, draftJob: job },
      updated_at: now,
    })
    .eq("id", projectId)
    .eq("updated_at", current.updated_at)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();
  if (saved.error) throw new Error(saved.error.message);
  if (!saved.data)
    throw new Error("This project just changed. Try Produce draft again.");
  return job;
}

export async function advanceProducerDraft(projectId: string) {
  const service = createServiceClient();
  if (!service) throw new Error("Project storage is unavailable.");
  const current = await project(service, projectId);
  const initial = current?.director_metadata?.draftJob as
    | ProducerDraftJob
    | undefined;
  if (
    !current ||
    !initial ||
    initial.status !== "running" ||
    Date.parse(initial.leaseUntil ?? "") > Date.now()
  )
    return;
  if (Date.now() - Date.parse(initial.startedAt) > 6 * 60 * 60 * 1000) {
    const expired = {
      ...initial,
      status: "failed",
      message: "Production needs attention.",
      error: "Production exceeded six hours. Check the source job and retry.",
    };
    await service
      .from("video_producer_projects")
      .update({
        director_metadata: { ...current.director_metadata, draftJob: expired },
      })
      .eq("id", projectId)
      .eq("updated_at", current.updated_at);
    return;
  }
  const lease = randomUUID();
  const job: ProducerDraftJob = {
    ...initial,
    lease,
    leaseUntil: new Date(Date.now() + LEASE_MS).toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const claim = await service
    .from("video_producer_projects")
    .update({
      director_metadata: { ...current.director_metadata, draftJob: job },
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId)
    .eq("updated_at", current.updated_at)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();
  if (claim.error) throw new Error(claim.error.message);
  if (!claim.data) return; // Another runner won the lease.
  try {
    if (!current.transcript_text?.trim()) {
      if (current.status === "failed")
        throw new Error(
          "Transcription failed. Retry transcription from Upload, then retry the draft.",
        );
      if (current.status !== "transcribing")
        await invoke(runProducerTranscribe, { projectId }, job);
      job.message = "Listening to your recording and finding every word…";
    } else if (!current.edit_plan) {
      await invoke(runProducerDirect, { projectId }, job);
      job.message = "The first cut is ready. Planning your visual moments…";
    } else {
      const beats = await service
        .from("video_producer_visual_beats")
        .select("id,recommendation,status")
        .eq("project_id", projectId)
        .order("source_start");
      if (beats.error) throw new Error(beats.error.message);
      if (
        !beats.data?.length &&
        !current.director_metadata?.visualPass?.analyzedAt
      ) {
        await invoke(runProducerVisualPlan, { projectId }, job);
        job.message = "Visual moments mapped. Looking for real footage…";
      } else {
        const next = beats.data?.find(
          (b) =>
            b.recommendation === "b-roll" &&
            b.status !== "resolved" &&
            b.status !== "skipped" &&
            !job.attemptedBeats.includes(b.id),
        );
        if (next) {
          // A completed or in-flight import is an idempotency marker after a runner restart.
          const imports = await service
            .from("video_producer_visual_import_jobs")
            .select("id,status")
            .eq("beat_id", next.id)
            .in("status", [
              "queued",
              "downloading",
              "normalizing",
              "uploading",
              "completed",
            ])
            .limit(1);
          if (imports.error) throw new Error(imports.error.message);
          if (!imports.data?.length) {
            const found = await invoke<{
              candidates: { id: string; score?: number; provider: string }[];
            }>(runProducerVisualSearch, { beatId: next.id }, job);
            // Keep the existing Visual Pass threshold. This is a search-ranking heuristic,
            // not a claim of visual/semantic verification. Every shot remains reviewable.
            const best = found.candidates.find(
              (c) => Number(c.score ?? 0) >= 84,
            );
            if (best)
              await invoke(runProducerVisualUse, { candidateId: best.id }, job);
          }
          job.attemptedBeats = [...job.attemptedBeats, next.id];
          job.message = `Finding footage · ${job.attemptedBeats.length} visual moments checked`;
        } else {
          job.status = "completed";
          job.message =
            "Your draft is ready to shape. Review B-roll choices, then render your video.";
        }
      }
    }
  } catch (error) {
    job.status = "failed";
    job.error =
      error instanceof Error ? error.message : "Draft production failed.";
    job.message = "Your draft needs attention. Your existing work is saved.";
  }
  const latest = await project(service, projectId);
  // Operations can update project metadata. Merge the newest state and honor the lease.
  if (
    latest?.director_metadata?.draftJob?.id !== job.id ||
    latest.director_metadata.draftJob.lease !== lease
  )
    return;
  const finished: ProducerDraftJob = {
    ...job,
    lease: undefined,
    leaseUntil: undefined,
    updatedAt: new Date().toISOString(),
  };
  const saved = await service
    .from("video_producer_projects")
    .update({
      director_metadata: { ...latest.director_metadata, draftJob: finished },
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId)
    .eq("updated_at", latest.updated_at)
    .is("deleted_at", null);
  if (saved.error) throw new Error(saved.error.message);
}
