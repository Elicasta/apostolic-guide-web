import { createHash } from "node:crypto";
import { scriptures } from "@/data";
import type { WebsitePathway } from "@/pathway-catalog";
import { createServiceClient } from "@/supabase";

export type PathwayAudioAsset = {
  pathwaySlug: string;
  audioUrl: string;
  contentHash: string;
  model: string;
  voice: string;
  generatedAt: string;
};

function compactText(value: string, max = 280) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  const clipped = normalized.slice(0, max - 1);
  const lastSpace = clipped.lastIndexOf(" ");
  return `${clipped.slice(0, lastSpace > 180 ? lastSpace : clipped.length)}…`;
}

export function buildPathwayNarration(pathway: WebsitePathway) {
  const parts = [
    `Apostolic Guide. ${pathway.title}.`,
    pathway.summary,
    `This pathway contains ${pathway.steps.length} key steps.`
  ];

  pathway.steps.forEach((step, index) => {
    const scripture = scriptures.find((item) => item.reference === step.reference || item.reference.startsWith(step.reference.replace(/–.*/, "")));
    parts.push(`Step ${index + 1}. ${step.title}. ${step.reference}.`);
    if (scripture?.text) parts.push(compactText(scripture.text));
    parts.push(step.explanation);
  });

  parts.push(`You have completed the ${pathway.title} pathway. Continue studying the connected Scriptures at Apostolic Guide.`);
  return parts.join("\n\n");
}

export function hashAudioText(value: string) {
  return createHash("sha256").update(value.trim()).digest("hex");
}

export function pathwayNarrationHash(pathway: WebsitePathway) {
  return hashAudioText(buildPathwayNarration(pathway));
}

export async function getPathwayAudioAsset(pathwaySlug: string): Promise<PathwayAudioAsset | null> {
  const service = createServiceClient();
  if (!service) return null;

  const { data, error } = await service
    .from("pathway_audio_assets")
    .select("pathway_slug,audio_url,content_hash,model,voice,generated_at")
    .eq("pathway_slug", pathwaySlug)
    .maybeSingle();

  if (error || !data) return null;
  return {
    pathwaySlug: String(data.pathway_slug),
    audioUrl: String(data.audio_url),
    contentHash: String(data.content_hash),
    model: String(data.model),
    voice: String(data.voice),
    generatedAt: String(data.generated_at)
  };
}
