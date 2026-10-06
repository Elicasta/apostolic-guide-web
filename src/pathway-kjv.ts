import { pathwayKjvNewTestament } from "./pathway-kjv-new-testament";
import { pathwayKjvOldTestament } from "./pathway-kjv-old-testament";
import type { PathwayKjvPassage } from "./pathway-kjv-types";

export type { PathwayKjvPassage, PathwayKjvVerse } from "./pathway-kjv-types";

/**
 * Full KJV passages used by public Pathways.
 *
 * The text is stored locally so the study never depends on an external Bible
 * request. Source corpus: nolanbaxter/kjv-bible, public-domain KJV text.
 */
export const pathwayKjvPassages: Record<string, PathwayKjvPassage> = {
  ...pathwayKjvOldTestament,
  ...pathwayKjvNewTestament
};

export function getPathwayKjvPassage(reference: string) {
  return pathwayKjvPassages[reference] ?? null;
}
