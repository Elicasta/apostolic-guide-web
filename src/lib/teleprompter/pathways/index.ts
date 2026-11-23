import { allPathways } from "../../../pathway-catalog";
import { getPathwayKjvPassage } from "../../../pathway-kjv";
import type { WebsitePathway } from "../../../pathway-catalog";
import type { TeleprompterDocument } from "../types";

/**
 * The public /pathways/[slug] reader and the teleprompter read-along share
 * the SAME source: allPathways and getPathwayKjvPassage.
 * Never paraphrase a Pathway here or maintain 20 independent copies.
 */
export const TELEPROMPTER_PATHWAY_SEED_KEY = "ag:teleprompter:pathway-readalong:v1";
export const TELEPROMPTER_PATHWAY_SIGNATURES_KEY = "ag:teleprompter:pathway-readalong:signatures:v1";
export const TELEPROMPTER_PATHWAY_SEEDED_AT = "2026-11-23T00:00:00.000Z";

export function pathwayDocumentId(slug: string): string {
  return `ag-pathway-${slug}`;
}

export function publicPathwayUrl(slug: string): string {
  return `https://www.apostolicguide.com/pathways/${slug}`;
}

export function pathwayFromDocumentId(id: string): WebsitePathway | undefined {
  return allPathways.find((pathway) => pathwayDocumentId(pathway.slug) === id);
}

export function pathwayDocumentTitle(pathway: WebsitePathway, index: number): string {
  return `Pathway ${String(index + 1).padStart(2, "0")} · ${pathway.title}`;
}

function buildPathwayStep(
  pathway: WebsitePathway,
  stepIndex: number,
): string {
  const step = pathway.steps[stepIndex];
  const next = pathway.steps[stepIndex + 1];
  const scripture = getPathwayKjvPassage(step.reference);
  if (!scripture?.verses.length) {
    throw new Error(`Missing public KJV passage for ${pathway.slug}: ${step.reference}`);
  }
  // Mirrors the public PathwayCardReader's displayed content in exactly
  // the same order: heading, KJV, explanation, and next-question hook.
  const nextQuestion = step.hook ??
    (next ? `${next.reference} takes the next step in the study: ${next.title}.` : "");
  return [
    `# ${step.title}`,
    `@ref ${step.reference}`,
    `@note PATHWAY STEP ${stepIndex + 1} OF ${pathway.steps.length} · The Scripture, explanation and transition below match the public Pathway.`,
    ...scripture.verses.map((verse) => `> ${verse.number} ${verse.text}`),
    "",
    step.explanation,
    ...(nextQuestion ? ["", nextQuestion] : []),
  ].join("\n");
}

export function buildPathwayReadAlongScript(pathway: WebsitePathway): string {
  const url = publicPathwayUrl(pathway.slug);
  const intro = [
    `# ${pathway.title}`,
    "@note INTRO · Recording introduction, not part of the public Pathway text.",
    "Welcome to Apostolic Guide.",
    `Today we're walking through the Pathway called ${pathway.title}. ${pathway.summary}`,
    `If you want to follow along word for word, open ${url}. We'll read the Scriptures and follow the study in the same order you see online.`,
  ].join("\n");

  const outro = [
    "# Read the Pathway",
    "@note CTA · Recording outro, not part of the public Pathway text.",
    `Continue studying ${pathway.title} at ${url}.`,
    "Read each Scripture in context and follow the steps yourself. You can return to this exact Pathway whenever you need to review the study.",
  ].join("\n");

  return [intro, ...pathway.steps.map((_, index) => buildPathwayStep(pathway, index)), outro]
    .join("\n\n---\n\n");
}

export function getPathwaySeedDocuments(): TeleprompterDocument[] {
  return allPathways.map((pathway, index) => ({
    id: pathwayDocumentId(pathway.slug),
    title: pathwayDocumentTitle(pathway, index),
    content: buildPathwayReadAlongScript(pathway),
    createdAt: TELEPROMPTER_PATHWAY_SEEDED_AT,
    updatedAt: TELEPROMPTER_PATHWAY_SEEDED_AT,
  }));
}

/** Compare title AND body; local edits must never be silently replaced. */
export function pathwayDocumentSignature(document: Pick<TeleprompterDocument, "title" | "content">): string {
  const text = `${document.title}\0${document.content}`;
  // Two independent rolling 32-bit hashes plus byte count. Used only for
  // change detection, not security or authentication.
  let a = 2166136261;
  let b = 5381;
  for (let i = 0; i < text.length; i += 1) {
    const value = text.charCodeAt(i);
    a = Math.imul(a ^ value, 16777619);
    b = Math.imul(b, 33) ^ value;
  }
  return `${text.length}:${(a >>> 0).toString(16)}:${(b >>> 0).toString(16)}`;
}

export function getPathwaySeedSignatures(seeds = getPathwaySeedDocuments()): Record<string, string> {
  return Object.fromEntries(seeds.map((seed) => [seed.id, pathwayDocumentSignature(seed)]));
}
