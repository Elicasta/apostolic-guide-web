import { z } from "zod";
import type { SolTool } from "../types";

function extractText(payload: Record<string, unknown>) {
  if (typeof payload.output_text === "string") return payload.output_text;
  if (!Array.isArray(payload.output)) return "";
  for (const item of payload.output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const row = part as Record<string, unknown>;
      if (row.type === "output_text" && typeof row.text === "string") return row.text;
    }
  }
  return "";
}

function usage(payload: Record<string, unknown>) {
  const raw = payload.usage && typeof payload.usage === "object" ? payload.usage as Record<string, unknown> : {};
  return { inputTokens: Number(raw.input_tokens) || 0, outputTokens: Number(raw.output_tokens) || 0, totalTokens: Number(raw.total_tokens) || 0 };
}

async function responseRequest(input: { instructions: string; prompt: string; effort: "low" | "medium" | "high"; format?: Record<string, unknown> }, signal: AbortSignal) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw Object.assign(new Error("OPENAI_API_KEY is not configured."), { code: "AUTH_REQUIRED" });
  const model = process.env.OPENAI_SOL_RUNTIME_MODEL?.trim() || process.env.OPENAI_SOL_OPERATOR_MODEL?.trim() || "gpt-5.6-sol";
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    signal,
    body: JSON.stringify({
      model,
      instructions: input.instructions,
      input: [{ role: "user", content: [{ type: "input_text", text: input.prompt }] }],
      reasoning: { effort: input.effort },
      text: input.format ? { verbosity: "low", format: input.format } : { verbosity: "low" }
    })
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof (payload.error as Record<string, unknown> | undefined)?.message === "string" ? String((payload.error as Record<string, unknown>).message) : `OpenAI request failed (${response.status}).`);
  return { payload, model };
}

const textInput = z.object({ instructions: z.string().max(20_000).default("You are SOL Runtime. Make the smallest necessary judgment and return only the requested result."), prompt: z.string().min(1).max(100_000), effort: z.enum(["low","medium","high"]).default("medium") });
const textOutput = z.object({ text: z.string(), model: z.string(), usage: z.object({ inputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative(), totalTokens: z.number().int().nonnegative() }) });
export const solAiGenerateTextTool: SolTool<z.infer<typeof textInput>, z.infer<typeof textOutput>> = {
  name: "ai.generateText", description: "Use AI for a bounded language or judgment step and return plain text.", inputSchema: textInput, outputSchema: textOutput,
  permissions: ["execute"], supportedEnvironments: ["local","development","preview","production"], idempotency: "supported",
  async execute(input, context) {
    try {
      const { payload, model } = await responseRequest(input, context.signal);
      const text = extractText(payload).trim();
      if (!text) throw new Error("AI returned no text.");
      const stats = usage(payload);
      return { ok: true, data: { text, model, usage: stats }, observations: { model, ...stats, aiDecision: true } };
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI generation failed.";
      return { ok: false, error: { code: /API_KEY|auth/i.test(message) ? "AUTH_REQUIRED" : "AI_FAILED", message, retryable: /timeout|429|rate|5\d\d/i.test(message) } };
    }
  }
};

const jsonInput = z.object({ instructions: z.string().max(20_000), prompt: z.string().min(1).max(100_000), schemaName: z.string().regex(/^[A-Za-z0-9_]+$/), schema: z.record(z.string(), z.unknown()), effort: z.enum(["low","medium","high"]).default("medium") });
const jsonOutput = z.object({ data: z.record(z.string(), z.unknown()), model: z.string(), usage: z.object({ inputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative(), totalTokens: z.number().int().nonnegative() }) });
export const solAiGenerateJsonTool: SolTool<z.infer<typeof jsonInput>, z.infer<typeof jsonOutput>> = {
  name: "ai.generateJson", description: "Use AI only for a bounded judgment step and require JSON matching a supplied schema.", inputSchema: jsonInput, outputSchema: jsonOutput,
  permissions: ["execute"], supportedEnvironments: ["local","development","preview","production"], idempotency: "supported",
  async execute(input, context) {
    try {
      const { payload, model } = await responseRequest({ instructions: input.instructions, prompt: input.prompt, effort: input.effort, format: { type: "json_schema", name: input.schemaName, strict: true, schema: input.schema } }, context.signal);
      const text = extractText(payload).trim();
      const data = JSON.parse(text) as Record<string, unknown>;
      const stats = usage(payload);
      return { ok: true, data: { data, model, usage: stats }, observations: { model, ...stats, aiDecision: true } };
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI JSON generation failed.";
      return { ok: false, error: { code: /API_KEY|auth/i.test(message) ? "AUTH_REQUIRED" : "AI_FAILED", message, retryable: /timeout|429|rate|5\d\d/i.test(message) } };
    }
  }
};
