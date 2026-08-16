import { z } from "zod";
import { solAiGenerateJsonTool } from "../../sol-core/tools/ai";
import type { SolTool, SolToolContext } from "../../sol-core/tools/types";
import { apostolicPathwaySchema } from "./source";

async function aiJson(context: SolToolContext, input: { instructions: string; prompt: string; schemaName: string; schema: Record<string, unknown> }) {
  await context.emit("ai.started", `${input.schemaName} judgment started.`);
  const result = await solAiGenerateJsonTool.execute({ ...input, effort: "medium" }, context);
  if (!result.ok) throw Object.assign(new Error(result.error.message), { solCode: result.error.code, retryable: result.error.retryable });
  await context.emit("ai.completed", `${input.schemaName} judgment completed.`, { model: result.data.model, usage: result.data.usage });
  return result.data;
}

export const campaignConceptDataSchema = z.object({
  title: z.string(), thesis: z.string(), audience: z.string(), hook: z.string(), contentAngle: z.string(), keyword: z.string(), channels: z.array(z.string()), guardrails: z.array(z.string())
});
export const campaignConceptSchema = campaignConceptDataSchema.extend({ model: z.string(), usage: z.record(z.string(), z.number()) });
const conceptInput = z.object({ pathway: apostolicPathwaySchema });
const conceptJsonSchema = { type: "object", additionalProperties: false, required: ["title","thesis","audience","hook","contentAngle","keyword","channels","guardrails"], properties: { title:{type:"string"}, thesis:{type:"string"}, audience:{type:"string"}, hook:{type:"string"}, contentAngle:{type:"string"}, keyword:{type:"string"}, channels:{type:"array",items:{type:"string"}}, guardrails:{type:"array",items:{type:"string"}} } };
export const apostolicCampaignConceptTool: SolTool<z.infer<typeof conceptInput>, z.infer<typeof campaignConceptSchema>> = {
  name: "apostolic.content.createCampaignConcept", description: "Use one bounded AI decision to choose the campaign angle while staying inside the approved Pathway.", inputSchema: conceptInput, outputSchema: campaignConceptSchema,
  permissions: ["execute"], supportedEnvironments: ["local","development","preview","production"], idempotency: "supported",
  async execute(input, context) {
    try {
      const result = await aiJson(context, { instructions: "You are the Apostolic Guide campaign strategist. Use only the supplied approved Pathway as doctrinal source. Do not add doctrine, quotations, historical claims, Greek/Hebrew claims, or interpretations not supported by the supplied source. Choose a direct Scripture-first campaign angle. The keyword must be one short word.", prompt: JSON.stringify(input.pathway), schemaName: "apostolic_campaign_concept", schema: conceptJsonSchema });
      const parsed = campaignConceptDataSchema.parse(result.data);
      return { ok: true, data: { ...parsed, model: result.model, usage: result.usage }, observations: { aiDecision: true, model: result.model, ...result.usage } };
    } catch (error) {
      return { ok: false, error: { code: (error as { solCode?: string })?.solCode || "AI_FAILED", message: error instanceof Error ? error.message : "Campaign concept failed.", retryable: Boolean((error as { retryable?: boolean })?.retryable) } };
    }
  }
};

export const campaignCopyDataSchema = z.object({ instagramCaption: z.string(), shortCaption: z.string(), youtubeTitle: z.string(), youtubeDescription: z.string(), emailSubject: z.string(), emailBody: z.string(), commentReply: z.string(), keyword: z.string() });
export const campaignCopySchema = campaignCopyDataSchema.extend({ model: z.string(), usage: z.record(z.string(), z.number()) });
const copyInput = z.object({ pathway: apostolicPathwaySchema, concept: campaignConceptSchema.passthrough() });
const copyJsonSchema = { type:"object", additionalProperties:false, required:["instagramCaption","shortCaption","youtubeTitle","youtubeDescription","emailSubject","emailBody","commentReply","keyword"], properties:{ instagramCaption:{type:"string"}, shortCaption:{type:"string"}, youtubeTitle:{type:"string"}, youtubeDescription:{type:"string"}, emailSubject:{type:"string"}, emailBody:{type:"string"}, commentReply:{type:"string"}, keyword:{type:"string"} } };
export const apostolicCampaignCopyTool: SolTool<z.infer<typeof copyInput>, z.infer<typeof campaignCopySchema>> = {
  name: "apostolic.content.createCopyPackage", description: "Generate the reusable campaign copy package from approved doctrine and the approved campaign angle.", inputSchema: copyInput, outputSchema: campaignCopySchema,
  permissions: ["execute"], supportedEnvironments: ["local","development","preview","production"], idempotency: "supported",
  async execute(input, context) {
    try {
      const result = await aiJson(context, { instructions: "Write Apostolic Guide campaign copy from the supplied Pathway and campaign concept. Scripture references and doctrinal statements must remain inside the supplied source. Do not quote verse text unless exact wording is supplied. Keep social copy concise and direct. Nothing is published by this step.", prompt: JSON.stringify(input), schemaName: "apostolic_campaign_copy", schema: copyJsonSchema });
      const parsed = campaignCopyDataSchema.parse(result.data);
      return { ok: true, data: { ...parsed, model: result.model, usage: result.usage }, observations: { aiDecision: true, model: result.model, ...result.usage } };
    } catch (error) {
      return { ok: false, error: { code: (error as { solCode?: string })?.solCode || "AI_FAILED", message: error instanceof Error ? error.message : "Campaign copy failed.", retryable: Boolean((error as { retryable?: boolean })?.retryable) } };
    }
  }
};

export const carouselSlideSchema = z.object({ kind: z.enum(["cover","scripture","statement","connection","cta"]), eyebrow: z.string(), title: z.string(), body: z.string(), reference: z.string() });
export const carouselDeckDataSchema = z.object({ title: z.string(), slides: z.array(carouselSlideSchema).min(4).max(10) });
export const carouselDeckSchema = carouselDeckDataSchema.extend({ model: z.string(), usage: z.record(z.string(), z.number()) });
const deckInput = z.object({ pathway: apostolicPathwaySchema, concept: campaignConceptSchema.passthrough(), copy: campaignCopySchema.passthrough(), slideCount: z.number().int().min(4).max(10).default(8) });
function deckJsonSchema(slideCount: number) { return { type:"object", additionalProperties:false, required:["title","slides"], properties:{ title:{type:"string"}, slides:{type:"array",minItems:slideCount,maxItems:slideCount,items:{type:"object",additionalProperties:false,required:["kind","eyebrow","title","body","reference"],properties:{kind:{type:"string",enum:["cover","scripture","statement","connection","cta"]},eyebrow:{type:"string"},title:{type:"string"},body:{type:"string"},reference:{type:"string"}}}} } }; }
export const apostolicCarouselDeckTool: SolTool<z.infer<typeof deckInput>, z.infer<typeof carouselDeckSchema>> = {
  name: "apostolic.carousel.createStructuredDeck", description: "Create a structured carousel deck from the campaign package.", inputSchema: deckInput, outputSchema: carouselDeckSchema,
  permissions: ["execute"], supportedEnvironments: ["local","development","preview","production"], idempotency: "supported",
  async execute(input, context) {
    try {
      const result = await aiJson(context, { instructions: `Create exactly ${input.slideCount} mobile-first carousel slides. Use one idea per slide. Use only the supplied approved Pathway for doctrine and references. Cover first, CTA last. Do not invent verse quotations.`, prompt: JSON.stringify(input), schemaName: "apostolic_carousel_deck", schema: deckJsonSchema(input.slideCount) });
      const parsed = carouselDeckDataSchema.parse(result.data);
      if (parsed.slides.length !== input.slideCount) throw new Error(`Expected exactly ${input.slideCount} slides.`);
      return { ok: true, data: { ...parsed, model: result.model, usage: result.usage }, observations: { aiDecision: true, model: result.model, ...result.usage } };
    } catch (error) {
      return { ok: false, error: { code: (error as { solCode?: string })?.solCode || "AI_FAILED", message: error instanceof Error ? error.message : "Carousel deck failed.", retryable: Boolean((error as { retryable?: boolean })?.retryable) } };
    }
  }
};

export const doctrineCheckDataSchema = z.object({ status: z.enum(["pass","warning","blocked"]), issues: z.array(z.string()), sourceRefs: z.array(z.string()), explanation: z.string() });
export const doctrineCheckSchema = doctrineCheckDataSchema.extend({ model: z.string(), usage: z.record(z.string(), z.number()) });
const doctrineInput = z.object({ pathway: apostolicPathwaySchema, content: z.unknown() });
const doctrineJsonSchema = { type:"object", additionalProperties:false, required:["status","issues","sourceRefs","explanation"], properties:{ status:{type:"string",enum:["pass","warning","blocked"]}, issues:{type:"array",items:{type:"string"}}, sourceRefs:{type:"array",items:{type:"string"}}, explanation:{type:"string"} } };
export const apostolicDoctrineCheckTool: SolTool<z.infer<typeof doctrineInput>, z.infer<typeof doctrineCheckSchema>> = {
  name: "apostolic.doctrine.check", description: "Compare generated campaign language against the approved Pathway and flag unsupported theology.", inputSchema: doctrineInput, outputSchema: doctrineCheckSchema,
  permissions: ["execute"], supportedEnvironments: ["local","development","preview","production"], idempotency: "supported",
  async execute(input, context) {
    try {
      const result = await aiJson(context, { instructions: "You are the Apostolic Guide doctrine checker. The supplied Pathway is the only canonical source for this check. PASS only if the generated content stays within it. WARNING for wording that needs clarification but does not contradict it. BLOCKED for unsupported doctrine, invented Scripture wording, claims outside the source, or theological drift. Do not improve or rewrite the source. Return sourceRefs only from the supplied Pathway.", prompt: JSON.stringify(input), schemaName: "apostolic_doctrine_check", schema: doctrineJsonSchema });
      const parsed = doctrineCheckDataSchema.parse(result.data);
      return { ok: true, data: { ...parsed, model: result.model, usage: result.usage }, observations: { aiDecision: true, model: result.model, ...result.usage, doctrineStatus: parsed.status } };
    } catch (error) {
      return { ok: false, error: { code: (error as { solCode?: string })?.solCode || "AI_FAILED", message: error instanceof Error ? error.message : "Doctrine check failed.", retryable: Boolean((error as { retryable?: boolean })?.retryable) } };
    }
  }
};
