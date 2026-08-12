import type { PathwayVideoCueKind } from "./pathway-video";

export type DirectedPathwayVideoCue = {
  anchorText: string;
  kind: Extract<PathwayVideoCueKind, "question" | "statement" | "recap">;
  eyebrow: string;
  title: string;
  body: string;
  reference: string;
};

export const PATHWAY_VIDEO_DIRECTOR_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["cues"],
  properties: {
    cues: {
      type: "array",
      minItems: 4,
      maxItems: 18,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["anchorText", "kind", "eyebrow", "title", "body", "reference"],
        properties: {
          anchorText: { type: "string", minLength: 4, maxLength: 180 },
          kind: { type: "string", enum: ["question", "statement", "recap"] },
          eyebrow: { type: "string", maxLength: 120 },
          title: { type: "string", maxLength: 220 },
          body: { type: "string", maxLength: 500 },
          reference: { type: "string", maxLength: 120 }
        }
      }
    }
  }
} as const;

function cleanString(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function normalizeDirectedPathwayVideoCues(value: unknown): DirectedPathwayVideoCue[] {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  if (!Array.isArray(source.cues)) return [];
  return source.cues.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const kind = row.kind;
    if (kind !== "question" && kind !== "statement" && kind !== "recap") return [];
    const anchorText = cleanString(row.anchorText, 180);
    const title = cleanString(row.title, 220);
    if (!anchorText || !title) return [];
    return [{
      anchorText,
      kind,
      eyebrow: cleanString(row.eyebrow, 120),
      title,
      body: cleanString(row.body, 500),
      reference: cleanString(row.reference, 120)
    } satisfies DirectedPathwayVideoCue];
  });
}
