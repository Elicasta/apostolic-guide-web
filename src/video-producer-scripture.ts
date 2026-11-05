import corpus from "./scripture-data/kjv.json";
import { readKjvPassage, type KjvCorpus } from "./kjv-reader";
import type { VideoProducerEditPlan, VideoProducerOverlay } from "./video-producer";

/** Scripture graphics are citations, not editable transcript paraphrases. */
export function correctScriptureOverlay(overlay: VideoProducerOverlay): VideoProducerOverlay {
  if (overlay.kind !== "scripture") return overlay;
  const reference = overlay.reference?.trim();
  if (!reference) throw new Error("Scripture overlay " + overlay.id + " needs a Bible reference.");
  const passage = readKjvPassage(corpus as KjvCorpus, reference);
  if (!passage) throw new Error("Scripture overlay " + overlay.id + " has an invalid KJV reference: " + reference);
  const title = passage.verses.map((verse) => verse.text).join(" ").trim();
  if (!title) throw new Error("KJV passage is empty: " + reference);
  return {
    ...overlay, title, body: undefined,
    // Never squeeze a full verse into a short lower-third.
    placement: title.length > 100 ? "full-frame" : overlay.placement
  };
}

export function correctScriptureOverlays(plan: VideoProducerEditPlan): VideoProducerEditPlan {
  if (!Array.isArray(plan.overlays)) throw new Error("Saved edit plan has no valid overlay list.");
  return { ...plan, overlays: plan.overlays.map(correctScriptureOverlay) };
}
