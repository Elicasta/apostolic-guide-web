import { z } from "zod";
import { assertSolPublicHttps } from "../../sol-core/tools/http/request";
import type { SolTool } from "../../sol-core/tools/types";
import { createServiceClient } from "../../supabase";
import { campaignConceptSchema, campaignCopySchema, carouselDeckSchema, doctrineCheckSchema } from "./content";
import { apostolicPathwaySchema } from "./source";

function db() {
  const client = createServiceClient();
  if (!client) throw new Error("Apostolic Guide database is not configured.");
  return client;
}
function object(value: unknown) { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function escapeXml(value: string) { return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;"); }
function wrap(value: string, width: number, maxLines: number) {
  const words = value.trim().split(/\s+/).filter(Boolean); const lines: string[] = []; let line = "";
  for (const word of words) { const candidate = line ? `${line} ${word}` : word; if (candidate.length > width && line) { lines.push(line); line = word; if (lines.length >= maxLines - 1) break; } else line = candidate; }
  if (line && lines.length < maxLines) lines.push(line); if (lines.join(" ").split(/\s+/).length < words.length && lines.length) lines[lines.length - 1] = `${lines[lines.length - 1].replace(/[.…]+$/, "")}…`; return lines;
}
function slideSvg(slide: { eyebrow: string; title: string; body: string; reference: string }, index: number, total: number) {
  const titleLines = wrap(slide.title, 24, 4); const bodyLines = wrap(slide.body, 48, 6);
  const titleSvg = titleLines.map((line, i) => `<text x="88" y="${380 + i * 90}" font-size="72" font-family="Arial,Helvetica,sans-serif" font-weight="800" fill="#F7F4ED">${escapeXml(line)}</text>`).join("");
  const bodyStart = 380 + titleLines.length * 90 + 72;
  const bodySvg = bodyLines.map((line, i) => `<text x="88" y="${bodyStart + i * 48}" font-size="32" font-family="Arial,Helvetica,sans-serif" fill="#D7DCE6">${escapeXml(line)}</text>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#071A38"/><stop offset="1" stop-color="#182B50"/></linearGradient></defs><rect width="1080" height="1350" fill="url(#g)"/><rect x="70" y="70" width="940" height="1210" rx="22" fill="none" stroke="#A7212D" stroke-width="3" opacity=".72"/><text x="88" y="154" font-size="25" font-family="Arial,Helvetica,sans-serif" font-weight="700" fill="#D94A56" letter-spacing="3">${escapeXml(slide.eyebrow.toUpperCase())}</text>${titleSvg}${bodySvg}<text x="88" y="1190" font-size="28" font-family="Georgia,serif" fill="#F7F4ED">${escapeXml(slide.reference)}</text><text x="88" y="1244" font-size="19" font-family="Arial,Helvetica,sans-serif" fill="#AEB7CA">APOSTOLIC GUIDE · ${index + 1}/${total}</text></svg>`;
}

const createInput = z.object({ pathway: apostolicPathwaySchema, concept: campaignConceptSchema.passthrough(), copy: campaignCopySchema.passthrough() });
const createOutput = z.object({ campaignId: z.string().uuid(), title: z.string(), status: z.literal("draft"), route: z.string() });
export const apostolicCampaignCreateDraftTool: SolTool<z.infer<typeof createInput>, z.infer<typeof createOutput>> = {
  name: "apostolic.campaign.createDraft", description: "Persist a draft campaign record. This never publishes anything.", inputSchema: createInput, outputSchema: createOutput,
  permissions: ["write"], supportedEnvironments: ["development","preview","production"], idempotency: "required",
  async execute(input, context) {
    try {
      const client = db(); const existing = await client.from("studio_campaigns").select("id,title").eq("runtime_run_id", context.runId).eq("pathway_slug", input.pathway.slug).maybeSingle(); if (existing.error) throw existing.error;
      if (existing.data) return { ok: true, data: { campaignId: String(existing.data.id), title: String(existing.data.title), status: "draft", route: `/admin/sol/campaigns/${existing.data.id}` } };
      const inserted = await client.from("studio_campaigns").insert({ pathway_slug: input.pathway.slug, title: input.concept.title || `${input.pathway.title} Campaign`, status: "draft", strategy: input.concept, copy_package: input.copy, runtime_run_id: context.runId }).select("id,title").single(); if (inserted.error) throw inserted.error;
      return { ok: true, data: { campaignId: String(inserted.data.id), title: String(inserted.data.title), status: "draft", route: `/admin/sol/campaigns/${inserted.data.id}` } };
    } catch (error) { return { ok: false, error: { code: "CAMPAIGN_CREATE_FAILED", message: error instanceof Error ? error.message : "Campaign draft failed.", retryable: false } }; }
  }
};

const renderInput = z.object({ pathway: apostolicPathwaySchema, campaignId: z.string().uuid(), deck: carouselDeckSchema.passthrough() });
export const carouselRenderOutputSchema = z.object({ campaignId: z.string().uuid(), slideCount: z.number().int(), width: z.literal(1080), height: z.literal(1350), slides: z.array(z.object({ id: z.string().uuid(), ordinal: z.number().int(), route: z.string(), title: z.string() })), artifacts: z.array(z.object({ type: z.string(), title: z.string(), storageType: z.literal("database"), location: z.string(), metadata: z.record(z.string(), z.unknown()), verificationStatus: z.enum(["pending","passed","failed"]) })) });
export const apostolicCarouselRenderTool: SolTool<z.infer<typeof renderInput>, z.infer<typeof carouselRenderOutputSchema>> = {
  name: "apostolic.carousel.render", description: "Deterministically render structured carousel slides into durable SVG image assets.", inputSchema: renderInput, outputSchema: carouselRenderOutputSchema,
  permissions: ["write"], supportedEnvironments: ["development","preview","production"], idempotency: "required",
  async execute(input) {
    try {
      const client = db(); const existing = await client.from("studio_campaign_artifacts").select("id,ordinal,title").eq("campaign_id", input.campaignId).eq("artifact_type", "carousel_slide").order("ordinal", { ascending: true }); if (existing.error) throw existing.error;
      let rows = existing.data ?? [];
      if (rows.length !== input.deck.slides.length) {
        if (rows.length) { const removed = await client.from("studio_campaign_artifacts").delete().eq("campaign_id", input.campaignId).eq("artifact_type", "carousel_slide"); if (removed.error) throw removed.error; }
        const inserts = input.deck.slides.map((slide, index) => ({ campaign_id: input.campaignId, pathway_slug: input.pathway.slug, artifact_type: "carousel_slide", title: slide.title, mime_type: "image/svg+xml", content_text: slideSvg(slide, index, input.deck.slides.length), content_json: slide, width: 1080, height: 1350, ordinal: index + 1, verification_status: "passed", metadata: { kind: slide.kind, reference: slide.reference } }));
        const inserted = await client.from("studio_campaign_artifacts").insert(inserts).select("id,ordinal,title"); if (inserted.error) throw inserted.error; rows = inserted.data ?? [];
      }
      const slides = rows.map((row) => ({ id: String(row.id), ordinal: Number(row.ordinal), route: `/api/admin/sol/campaign-artifacts/${row.id}`, title: String(row.title) })); const route = `/admin/sol/campaigns/${input.campaignId}`;
      return { ok: true, data: { campaignId: input.campaignId, slideCount: slides.length, width: 1080, height: 1350, slides, artifacts: [{ type: "instagram_carousel", title: `${input.pathway.title} carousel`, storageType: "database", location: route, metadata: { campaignId: input.campaignId, slideIds: slides.map((s) => s.id), slideCount: slides.length, width: 1080, height: 1350 }, verificationStatus: "passed" }] } };
    } catch (error) { return { ok: false, error: { code: "CAROUSEL_RENDER_FAILED", message: error instanceof Error ? error.message : "Carousel render failed.", retryable: false } }; }
  }
};

const packageInput = z.object({ pathway: apostolicPathwaySchema, campaignId: z.string().uuid(), copy: campaignCopySchema.passthrough() });
export const simpleArtifactOutputSchema = z.object({ id: z.string().uuid(), route: z.string(), artifacts: z.array(z.object({ type: z.string(), title: z.string(), storageType: z.literal("database"), location: z.string(), metadata: z.record(z.string(), z.unknown()), verificationStatus: z.enum(["pending","passed","failed"]) })) });
async function upsertArtifact(input: { campaignId: string; pathwaySlug: string; type: string; title: string; content: Record<string, unknown> }) {
  const client = db(); const existing = await client.from("studio_campaign_artifacts").select("id").eq("campaign_id", input.campaignId).eq("artifact_type", input.type).limit(1).maybeSingle(); if (existing.error) throw existing.error;
  if (existing.data?.id) { const update = await client.from("studio_campaign_artifacts").update({ title: input.title, content_json: input.content, verification_status: "passed" }).eq("id", existing.data.id); if (update.error) throw update.error; return String(existing.data.id); }
  const inserted = await client.from("studio_campaign_artifacts").insert({ campaign_id: input.campaignId, pathway_slug: input.pathwaySlug, artifact_type: input.type, title: input.title, mime_type: "application/json", content_json: input.content, verification_status: "passed" }).select("id").single(); if (inserted.error) throw inserted.error; return String(inserted.data.id);
}
function artifactResult(id: string, campaignId: string, type: string, title: string, metadata: Record<string, unknown>) { const route = `/admin/sol/campaigns/${campaignId}`; return { id, route, artifacts: [{ type, title, storageType: "database" as const, location: route, metadata, verificationStatus: "passed" as const }] }; }

export const apostolicSocialDraftTool: SolTool<z.infer<typeof packageInput>, z.infer<typeof simpleArtifactOutputSchema>> = {
  name: "apostolic.social.createDraft", description: "Persist social copy as a campaign draft artifact without publishing.", inputSchema: packageInput, outputSchema: simpleArtifactOutputSchema,
  permissions: ["write"], supportedEnvironments: ["development","preview","production"], idempotency: "required",
  async execute(input) { try { const content = { instagramCaption: input.copy.instagramCaption, shortCaption: input.copy.shortCaption, commentReply: input.copy.commentReply, keyword: input.copy.keyword, published: false }; const id = await upsertArtifact({ campaignId: input.campaignId, pathwaySlug: input.pathway.slug, type: "social_copy", title: `${input.pathway.title} social copy`, content }); return { ok: true, data: artifactResult(id, input.campaignId, "social_copy", `${input.pathway.title} social copy`, { campaignId: input.campaignId, artifactId: id, published: false }) }; } catch (error) { return { ok: false, error: { code: "SOCIAL_DRAFT_FAILED", message: error instanceof Error ? error.message : "Social draft failed.", retryable: false } }; } }
};
export const apostolicEmailDraftTool: SolTool<z.infer<typeof packageInput>, z.infer<typeof simpleArtifactOutputSchema>> = {
  name: "apostolic.email.createDraft", description: "Persist email copy as a campaign draft artifact without sending.", inputSchema: packageInput, outputSchema: simpleArtifactOutputSchema,
  permissions: ["write"], supportedEnvironments: ["development","preview","production"], idempotency: "required",
  async execute(input) { try { const content = { subject: input.copy.emailSubject, body: input.copy.emailBody, sent: false }; const id = await upsertArtifact({ campaignId: input.campaignId, pathwaySlug: input.pathway.slug, type: "email_draft", title: `${input.pathway.title} email draft`, content }); return { ok: true, data: artifactResult(id, input.campaignId, "email_draft", `${input.pathway.title} email draft`, { campaignId: input.campaignId, artifactId: id, sent: false }) }; } catch (error) { return { ok: false, error: { code: "EMAIL_DRAFT_FAILED", message: error instanceof Error ? error.message : "Email draft failed.", retryable: false } }; } }
};

const automationInput = z.object({ pathway: apostolicPathwaySchema, campaignId: z.string().uuid(), copy: campaignCopySchema.passthrough() });
const automationOutput = z.object({ automationId: z.string().uuid(), enabled: z.literal(false), route: z.string(), artifacts: z.array(z.object({ type: z.string(), title: z.string(), storageType: z.literal("database"), location: z.string(), metadata: z.record(z.string(), z.unknown()), verificationStatus: z.literal("passed") })) });
export const apostolicKeywordAutomationDraftTool: SolTool<z.infer<typeof automationInput>, z.infer<typeof automationOutput>> = {
  name: "apostolic.social.createKeywordAutomationDraft", description: "Create or reuse a disabled Instagram comment-keyword automation draft.", inputSchema: automationInput, outputSchema: automationOutput,
  permissions: ["write"], supportedEnvironments: ["development","preview","production"], idempotency: "required",
  async execute(input) {
    try {
      const client = db(); const keyword = input.copy.keyword.trim().toLowerCase(); const name = `${input.pathway.title} Pathway · ${keyword.toUpperCase()}`; const existing = await client.from("social_automations").select("id,enabled").eq("name", name).eq("enabled", false).maybeSingle(); if (existing.error) throw existing.error; let id = existing.data?.id ? String(existing.data.id) : "";
      if (!id) { const inserted = await client.from("social_automations").insert({ name, platform: "instagram", trigger_type: "comment_keyword", keywords: [keyword], match_type: "exact", reply_text: input.copy.commentReply, destination_url: `https://www.apostolicguide.com/pathways/${input.pathway.slug}`, enabled: false, created_by: "SOL Runtime" }).select("id").single(); if (inserted.error) throw inserted.error; id = String(inserted.data.id); }
      const update = await client.from("studio_campaigns").update({ keyword_automation_id: id }).eq("id", input.campaignId); if (update.error) throw update.error; const route = `/admin/sol/campaigns/${input.campaignId}`;
      return { ok: true, data: { automationId: id, enabled: false, route, artifacts: [{ type: "keyword_automation_draft", title: `${input.pathway.title} keyword automation`, storageType: "database", location: route, metadata: { campaignId: input.campaignId, automationId: id, enabled: false, keyword }, verificationStatus: "passed" }] } };
    } catch (error) { return { ok: false, error: { code: "AUTOMATION_DRAFT_FAILED", message: error instanceof Error ? error.message : "Automation draft failed.", retryable: false } }; }
  }
};

const linkInput = z.object({ urls: z.array(z.string().url()).min(1).max(20) });
export const linkOutputSchema = z.object({ passed: z.boolean(), total: z.number().int(), valid: z.number().int(), results: z.array(z.object({ url: z.string(), status: z.number().int().nullable(), ok: z.boolean(), error: z.string().nullable() })) });
export const apostolicValidateLinksTool: SolTool<z.infer<typeof linkInput>, z.infer<typeof linkOutputSchema>> = {
  name: "apostolic.publishing.validateLinks", description: "Validate campaign destination links without publishing anything.", inputSchema: linkInput, outputSchema: linkOutputSchema,
  permissions: ["read"], supportedEnvironments: ["development","preview","production"], idempotency: "not_required",
  async execute(input, context) { const results = await Promise.all(input.urls.map(async (raw) => { try { const url = await assertSolPublicHttps(raw); const response = await fetch(url, { method: "HEAD", redirect: "follow", cache: "no-store", signal: context.signal }); return { url: raw, status: response.status, ok: response.ok, error: null }; } catch (error) { return { url: raw, status: null, ok: false, error: error instanceof Error ? error.message : "Link failed." }; } })); const valid = results.filter((row) => row.ok).length; return { ok: true, data: { passed: valid === results.length, total: results.length, valid, results }, observations: { valid, total: results.length } }; }
};

const finalizeInput = z.object({ campaignId: z.string().uuid(), pathway: apostolicPathwaySchema, concept: campaignConceptSchema.passthrough(), copy: campaignCopySchema.passthrough(), doctrine: doctrineCheckSchema.passthrough(), links: linkOutputSchema, social: simpleArtifactOutputSchema, email: simpleArtifactOutputSchema, youtube: simpleArtifactOutputSchema, automation: automationOutput, carousel: carouselRenderOutputSchema });
const finalizeOutput = z.object({ campaignId: z.string().uuid(), route: z.string(), status: z.literal("review"), summary: z.object({ deterministicArtifacts: z.number().int(), doctrineStatus: z.string(), validLinks: z.string(), published: z.literal(false) }), artifacts: z.array(z.object({ type: z.string(), title: z.string(), storageType: z.literal("database"), location: z.string(), metadata: z.record(z.string(), z.unknown()), verificationStatus: z.enum(["pending","passed","failed"]) })) });
export const apostolicCampaignFinalizeTool: SolTool<z.infer<typeof finalizeInput>, z.infer<typeof finalizeOutput>> = {
  name: "apostolic.campaign.finalizeDraft", description: "Assemble the unified campaign review package and move the draft to review. Nothing is published.", inputSchema: finalizeInput, outputSchema: finalizeOutput,
  permissions: ["write"], supportedEnvironments: ["development","preview","production"], idempotency: "required",
  async execute(input) {
    try { const client = db(); const route = `/admin/sol/campaigns/${input.campaignId}`; const updated = await client.from("studio_campaigns").update({ status: "review", strategy: input.concept, copy_package: input.copy, social_package: { artifactId: input.social.id }, youtube_package: { artifactId: input.youtube.id }, email_package: { artifactId: input.email.id }, link_report: input.links, doctrine_report: input.doctrine, keyword_automation_id: input.automation.automationId }).eq("id", input.campaignId).select("id").single(); if (updated.error) throw updated.error; const countResult = await client.from("studio_campaign_artifacts").select("id", { count: "exact", head: true }).eq("campaign_id", input.campaignId); if (countResult.error) throw countResult.error; const deterministicArtifacts = Number(countResult.count) || 0; return { ok: true, data: { campaignId: input.campaignId, route, status: "review", summary: { deterministicArtifacts, doctrineStatus: input.doctrine.status, validLinks: `${input.links.valid}/${input.links.total}`, published: false }, artifacts: [{ type: "campaign_review_package", title: `${input.pathway.title} campaign`, storageType: "database", location: route, metadata: { campaignId: input.campaignId, doctrineStatus: input.doctrine.status, validLinks: `${input.links.valid}/${input.links.total}`, deterministicArtifacts, published: false }, verificationStatus: input.doctrine.status === "blocked" || !input.links.passed ? "pending" : "passed" }] } }; } catch (error) { return { ok: false, error: { code: "CAMPAIGN_FINALIZE_FAILED", message: error instanceof Error ? error.message : "Campaign finalization failed.", retryable: false } }; }
  }
};
