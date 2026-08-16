import { createHash } from "node:crypto";
import { z } from "zod";
import { pathwayBySlug } from "../../pathway-catalog";
import type { SolTool } from "../../sol-core/tools/types";

export const apostolicPathwaySchema = z.object({
  slug: z.string(),
  title: z.string(),
  summary: z.string(),
  route: z.string(),
  estimatedMinutes: z.number(),
  level: z.string(),
  steps: z.array(z.object({ title: z.string(), reference: z.string(), explanation: z.string() }))
});

const inputSchema = z.object({ slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) });
export const apostolicPathwayGetTool: SolTool<z.infer<typeof inputSchema>, z.infer<typeof apostolicPathwaySchema>> = {
  name: "apostolic.pathways.get",
  description: "Load one approved live Apostolic Guide Pathway as the canonical campaign source.",
  inputSchema,
  outputSchema: apostolicPathwaySchema,
  permissions: ["read"],
  supportedEnvironments: ["local", "development", "preview", "production"],
  idempotency: "not_required",
  async execute(input) {
    const pathway = pathwayBySlug(input.slug);
    if (!pathway) return { ok: false, error: { code: "PATHWAY_NOT_FOUND", message: `Pathway ${input.slug} does not exist.`, retryable: false } };
    return {
      ok: true,
      data: {
        slug: pathway.slug,
        title: pathway.title,
        summary: pathway.summary,
        route: `/pathways/${pathway.slug}`,
        estimatedMinutes: pathway.estimatedMinutes,
        level: pathway.level,
        steps: pathway.steps.map((step) => ({ title: step.title, reference: step.reference, explanation: step.explanation }))
      },
      observations: { canonicalSteps: pathway.steps.length }
    };
  }
};

const verifyInput = z.object({ pathway: apostolicPathwaySchema });
const verifyOutput = z.object({ valid: z.boolean(), sourceHash: z.string(), references: z.array(z.string()), issues: z.array(z.string()) });
export const apostolicDoctrineVerifySourceTool: SolTool<z.infer<typeof verifyInput>, z.infer<typeof verifyOutput>> = {
  name: "apostolic.doctrine.verifySource",
  description: "Deterministically verify a campaign source is byte-equivalent to the current canonical Pathway fields SOL is permitted to use.",
  inputSchema: verifyInput,
  outputSchema: verifyOutput,
  permissions: ["read"],
  supportedEnvironments: ["local", "development", "preview", "production"],
  idempotency: "not_required",
  async execute(input) {
    const canonical = pathwayBySlug(input.pathway.slug);
    if (!canonical) return { ok: false, error: { code: "PATHWAY_NOT_FOUND", message: "Canonical Pathway is missing.", retryable: false } };
    const canonicalSource = {
      slug: canonical.slug,
      title: canonical.title,
      summary: canonical.summary,
      route: `/pathways/${canonical.slug}`,
      estimatedMinutes: canonical.estimatedMinutes,
      level: canonical.level,
      steps: canonical.steps.map((step) => ({ title: step.title, reference: step.reference, explanation: step.explanation }))
    };
    const issues: string[] = [];
    if (JSON.stringify(canonicalSource) !== JSON.stringify(input.pathway)) issues.push("Supplied Pathway source differs from the current canonical source.");
    const sourceHash = createHash("sha256").update(JSON.stringify(canonicalSource)).digest("hex");
    return {
      ok: true,
      data: { valid: issues.length === 0, sourceHash, references: canonical.steps.map((step) => step.reference), issues },
      observations: { issueCount: issues.length, hashAlgorithm: "sha256" }
    };
  }
};
