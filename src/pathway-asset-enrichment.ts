import { z } from "zod";
import { normalizeAssetTags } from "@/pathway-asset-metadata";

export const pathwayAssetEnrichmentSchema = z.object({
  suggestedTitle: z.string().trim().min(1).max(180),
  description: z.string().trim().min(1).max(1200),
  altText: z.string().trim().min(1).max(500),
  tags: z.array(z.string().trim().min(1).max(40)).min(3).max(16),
  confidence: z.number().min(0).max(1).optional().default(0.8)
});

export type PathwayAssetEnrichment = z.infer<typeof pathwayAssetEnrichmentSchema>;

export function extractJsonObject(value: string) {
  const trimmed = value.trim();
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("Sol returned no JSON object.");
  return JSON.parse(unfenced.slice(start, end + 1)) as unknown;
}

export function parsePathwayAssetEnrichment(value: string) {
  const parsed = pathwayAssetEnrichmentSchema.parse(extractJsonObject(value));
  return { ...parsed, tags: normalizeAssetTags(parsed.tags) };
}
