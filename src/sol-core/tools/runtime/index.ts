import { z } from "zod";
import type { SolTool } from "../types";

const capabilitiesInput = z.object({});
const capabilitiesOutput = z.object({ browserScreenshot: z.boolean(), githubWrite: z.boolean(), openai: z.boolean(), vercelDeploy: z.boolean() });
export const solRuntimeCapabilitiesTool: SolTool<z.infer<typeof capabilitiesInput>, z.infer<typeof capabilitiesOutput>> = {
  name: "runtime.capabilities",
  description: "Read execution-provider readiness from server configuration without exposing secrets.",
  inputSchema: capabilitiesInput,
  outputSchema: capabilitiesOutput,
  permissions: ["read"],
  supportedEnvironments: ["local","development","preview","production"],
  idempotency: "not_required",
  async execute() {
    return { ok: true, data: { browserScreenshot: Boolean(process.env.BROWSERLESS_API_TOKEN?.trim()), githubWrite: Boolean(process.env.SOL_GITHUB_TOKEN?.trim() || process.env.GITHUB_TOKEN?.trim()), openai: Boolean(process.env.OPENAI_API_KEY?.trim()), vercelDeploy: Boolean(process.env.VERCEL_TOKEN?.trim()) } };
  }
};

const composeInput = z.object({ title: z.string().max(500).default(""), sections: z.array(z.object({ label: z.string().max(500).default(""), content: z.unknown() })).max(100), separator: z.string().max(20).default("\n\n") });
const composeOutput = z.object({ text: z.string(), sectionCount: z.number().int().nonnegative() });
export const solRuntimeComposeTextTool: SolTool<z.infer<typeof composeInput>, z.infer<typeof composeOutput>> = {
  name: "runtime.composeText",
  description: "Deterministically combine structured task outputs into text for a later language judgment step.",
  inputSchema: composeInput,
  outputSchema: composeOutput,
  permissions: ["execute"],
  supportedEnvironments: ["local","development","preview","production"],
  idempotency: "not_required",
  async execute(input) {
    const sections = input.sections.map((section) => {
      const value = typeof section.content === "string" ? section.content : JSON.stringify(section.content, null, 2);
      return section.label ? `${section.label}\n${value}` : value;
    });
    const text = [input.title, ...sections].filter(Boolean).join(input.separator);
    return { ok: true, data: { text, sectionCount: sections.length } };
  }
};
