import { z } from "zod";

const id = z.string().min(1).max(180);
const stringArray = z.array(z.string());

const relationshipSchema = z.object({
  targetReferenceId: id,
  type: z.enum(["next-logical", "previous-logical", "supporting", "parallel", "contrast", "context", "fulfillment", "objection", "response"]),
  label: z.string(),
  explanation: z.string(),
  priority: z.number().int()
}).passthrough();

export const scripturePayloadSchema = z.object({
  id,
  reference: z.string().min(2),
  book: z.string().min(1),
  chapter: z.number().int().positive(),
  verseStart: z.number().int().positive(),
  verseEnd: z.number().int().positive().optional(),
  translations: z.record(z.string(), z.string().min(1)),
  primaryTranslation: z.string().min(1),
  summary: z.string(),
  mainPoint: z.string().min(1),
  whyItMatters: z.string(),
  apostolicConnection: z.string(),
  commonMisunderstanding: z.string().optional(),
  conversationUse: z.string().optional(),
  chapterContext: z.string().optional(),
  languageNotes: z.array(z.object({ term: z.string(), transliteration: z.string().optional(), note: z.string() }).passthrough()).optional(),
  categories: stringArray,
  keywords: stringArray,
  phrases: stringArray,
  synonyms: stringArray,
  objections: stringArray,
  spanishKeywords: stringArray,
  priority: z.number().int(),
  isPrimaryReference: z.boolean(),
  relationships: z.array(relationshipSchema),
  pathwayIds: stringArray,
  published: z.boolean()
}).passthrough();

const pathwayStepSchema = z.object({
  id,
  order: z.number().int().nonnegative(),
  referenceId: id,
  heading: z.string().min(1),
  explanation: z.string().min(1),
  transitionToNext: z.string().optional()
}).passthrough();

export const pathwayPayloadSchema = z.object({
  id,
  slug: id,
  title: z.string().min(2),
  type: z.enum(["doctrine", "conversation", "discovery", "teaching"]),
  description: z.string(),
  coreClaim: z.string(),
  categoryIds: stringArray,
  keywords: stringArray,
  steps: z.array(pathwayStepSchema).min(1),
  branches: z.array(z.object({ label: z.string(), description: z.string(), targetPathwayId: id }).passthrough()),
  objections: z.array(z.object({ objection: z.string(), responseSummary: z.string(), referenceIds: stringArray }).passthrough()),
  summary: z.string(),
  published: z.boolean(),
  featured: z.boolean().optional()
}).passthrough();

export const objectionPayloadSchema = z.object({
  id,
  slug: id,
  title: z.string().min(2),
  commonWording: stringArray,
  argument: z.string().min(2),
  shortResponse: z.string().min(2),
  primaryReferenceId: id,
  supportingReferenceIds: stringArray,
  pathwayId: id,
  mistakesToAvoid: stringArray,
  deeperExplanation: z.string(),
  keywords: stringArray,
  published: z.boolean()
}).passthrough();

export const categoryPayloadSchema = z.object({
  id,
  slug: id,
  name: z.string().min(2),
  description: z.string(),
  parentId: id.optional(),
  aliases: stringArray,
  spanishAliases: stringArray,
  featured: z.boolean().optional()
}).passthrough();

export const appPayloadSchemas = {
  scripture: scripturePayloadSchema,
  pathway: pathwayPayloadSchema,
  objection: objectionPayloadSchema,
  category: categoryPayloadSchema
} as const;

export type AppEntityType = keyof typeof appPayloadSchemas;
