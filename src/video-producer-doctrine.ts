import "server-only";
import { createHash } from "node:crypto";
import { videoSceneDocument } from "./code-mode/video-scenes";
import { textDoctrineSource } from "./doctrine-gate";
import { normalizeVideoProducerTranscript } from "./video-producer-ai";
import type { VideoProducerEditPlan } from "./video-producer";

/** Doctrine is derived exclusively from the persisted project, never browser-supplied text. */
export type ProducerDoctrineProject = {
  id: string;
  mode: string;
  edit_plan: unknown;
  director_metadata?: unknown;
  transcript?: unknown;
  transcript_local_text?: string | null;
  pathway_slug?: string | null;
};

export function videoProducerDoctrineSource(project: ProducerDoctrineProject) {
  if (!project.edit_plan || typeof project.edit_plan !== "object") {
    throw new Error("Generate and save an edit plan before checking doctrine.");
  }
  const plan = project.edit_plan as VideoProducerEditPlan;
  if (!Array.isArray(plan.overlays)) throw new Error("The saved edit plan has invalid overlays.");
  const metadata = project.director_metadata && typeof project.director_metadata === "object"
    ? project.director_metadata as Record<string, unknown> : {};
  const rawScenes = metadata.kineticSceneV2;
  const parsedScenes = rawScenes ? videoSceneDocument.safeParse(rawScenes) : null;
  if (rawScenes && (!parsedScenes?.success || parsedScenes.data.kind !== "producer" || parsedScenes.data.id !== project.id)) {
    throw new Error("The saved video scene document is invalid or belongs to another project.");
  }
  const scenes = parsedScenes?.success ? parsedScenes.data.scenes : [];
  const transcript = normalizeVideoProducerTranscript(project.transcript);
  const cleanHtml = (value: string) => value
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ").trim();
  const revision = createHash("sha256").update(JSON.stringify({
    mode: project.mode, pathway: project.pathway_slug, plan: project.edit_plan,
    scenes: rawScenes || null, transcript: project.transcript, text: project.transcript_local_text
  })).digest("hex");
  return textDoctrineSource("video_clip", project.id, {
    content_revision: revision,
    video_mode: project.mode,
    pathway: project.pathway_slug || "",
    spoken_transcript: transcript.text || project.transcript_local_text || "",
    edit_overlays: plan.overlays.map((overlay, index) =>
      "Overlay " + (index + 1) + " (" + overlay.kind + "): " +
      [overlay.title, overlay.body, overlay.reference].filter(Boolean).join(" | ")
    ).join("\n"),
    on_screen_graphics: scenes.map((scene, index) =>
      "Scene " + (index + 1) + ": " + cleanHtml(scene.html)
    ).join("\n")
  });
}
