import { z } from "zod";
import { pathwayBySlug } from "../../pathway-catalog";
import { createServiceClient } from "../../supabase";
import { solAiGenerateJsonTool } from "../../sol-core/tools/ai";
import { assertSolPublicHttps } from "../../sol-core/tools/http/request";
import type { SolTool, SolToolContext } from "../../sol-core/tools/types";

function service() {
  const client = createServiceClient();
  if (!client) throw new Error("Apostolic Guide database is not configured.");
  return client;
}

function object(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function wrap(value: string, width: number, maxLines: number) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > width && line) {
      lines.push(line);
      line = word;
      if (lines.length >= maxLines - 1) break;
    } else line = candidate;
  }
  if (line && lines.length < maxLines) lines.push(line);
  const consumed = lines.join(" ").split(/\s+/).length;
  if (consumed < words.length && lines.length) lines[lines.length - 1] = `${lines[lines.length - 1].replace(/[.…]+$/, "")}…`;
  return lines;
}

async function aiJson(context: SolToolContext, input: { instructions: string; prompt: string; schemaName: string; schema: Record<string, unknown> }) {
  await context.emit("ai.started", `${input.schemaName} judgment started.`);
  const result = await solAiGenerateJsonTool.execute({ ...input, effort: "medium" }, context);
  if (!result.ok) throw Object.assign(new Error(result.error.message), { solCode: result.error.code, retryable: result.error.retryable });
  await context.emit("ai.completed", `${input.schemaName} judgment completed.`, { model: result.data.model, usage: result.data.usage });
  return result.data;
}

const pathwayOutput = z.object({ slug: z.string(), title: z.string(), summary: z.string(), route: z.string(), estimatedMinutes: z.number(), level: z.string(), steps: z.array(z.object({ title: z.string(), reference: z.string(), explanation: z.string() })) });
const pathwayInput = z.object({ slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) });
export const apostolicPathwayGetTool: SolTool<z.infer<typeof pathwayInput>, z.infer<typeof pathwayOutput>> = {
  name: "apostolic.pathways.get", description: "Load one approved live Apostolic Guide Pathway as canonical campaign source.", inputSchema: pathwayInput, outputSchema: pathwayOutput,
  permissions: ["read"], supportedEnvironments: ["local","development","preview","production"], idempotency: "not_required",
  async execute(input) {
    const pathway = pathwayBySlug(input.slug);
    if (!pathway) return { ok: false, error: { code: "PATHWAY_NOT_FOUND", message: `Pathway ${input.slug} does not exist.`, retryable: false } };
    return { ok: true, data: { slug: pathway.slug, title: pathway.title, summary: pathway.summary, route: `/pathways/${pathway.slug}`, estimatedMinutes: pathway.estimatedMinutes, level: pathway.level, steps: pathway.steps.map((step) => ({ title: step.title, reference: step.reference, explanation: step.explanation })) }, observations: { canonicalSteps: pathway.steps.length } };
  }
};

const sourceInput = z.object({ pathway: pathwayOutput });
const sourceOutput = z.object({ valid: z.boolean(), sourceHash: z.string(), references: z.array(z.string()), issues: z.array(z.string()) });
export const apostolicDoctrineVerifySourceTool: SolTool<z.infer<typeof sourceInput>, z.infer<typeof sourceOutput>> = {
  name: "apostolic.doctrine.verifySource", description: "Deterministically verify a campaign source is the current canonical Pathway.", inputSchema: sourceInput, outputSchema: sourceOutput,
  permissions: ["read"], supportedEnvironments: ["local","development","preview","production"], idempotency: "not_required",
  async execute(input) {
    const canonical = pathwayBySlug(input.pathway.slug);
    if (!canonical) return { ok: false, error: { code: "PATHWAY_NOT_FOUND", message: "Canonical Pathway is missing.", retryable: false } };
    const issues: string[] = [];
    if (canonical.title !== input.pathway.title) issues.push("Pathway title does not match canonical source.");
    if (canonical.steps.length !== input.pathway.steps.length) issues.push("Pathway step count does not match canonical source.");
    canonical.steps.forEach((step, index) => {
      const candidate = input.pathway.steps[index];
      if (!candidate || candidate.reference !== step.reference || candidate.explanation !== step.explanation) issues.push(`Canonical step ${index + 1} changed.`);
    });
    const sourceText = JSON.stringify({ slug: canonical.slug, title: canonical.title, summary: canonical.summary, steps: canonical.steps });
    const sourceHash = Buffer.from(sourceText).toString("base64url").slice(0, 120);
    return { ok: true, data: { valid: issues.length === 0, sourceHash, references: canonical.steps.map((step) => step.reference), issues }, observations: { issueCount: issues.length } };
  }
};

const conceptInput = z.object({ pathway: pathwayOutput });
const conceptOutput = z.object({ title: z.string(), thesis: z.string(), audience: z.string(), hook: z.string(), contentAngle: z.string(), keyword: z.string(), channels: z.array(z.string()), guardrails: z.array(z.string()), model: z.string(), usage: z.record(z.string(), z.number()) });
const conceptSchema = { type: "object", additionalProperties: false, required: ["title","thesis","audience","hook","contentAngle","keyword","channels","guardrails"], properties: { title:{type:"string"}, thesis:{type:"string"}, audience:{type:"string"}, hook:{type:"string"}, contentAngle:{type:"string"}, keyword:{type:"string"}, channels:{type:"array",items:{type:"string"}}, guardrails:{type:"array",items:{type:"string"}} } };
export const apostolicCampaignConceptTool: SolTool<z.infer<typeof conceptInput>, z.infer<typeof conceptOutput>> = {
  name: "apostolic.content.createCampaignConcept", description: "Use AI once to choose the campaign angle while staying inside the approved Pathway.", inputSchema: conceptInput, outputSchema: conceptOutput,
  permissions: ["execute"], supportedEnvironments: ["local","development","preview","production"], idempotency: "supported",
  async execute(input, context) {
    try {
      const result = await aiJson(context, { instructions: "You are the Apostolic Guide campaign strategist. Use only the supplied approved Pathway as doctrinal source. Do not add doctrine, quotations, historical claims, Greek/Hebrew claims, or interpretations not supported by the supplied source. Choose a direct Scripture-first campaign angle. The keyword must be one short uppercase-ready word.", prompt: JSON.stringify(input.pathway), schemaName: "apostolic_campaign_concept", schema: conceptSchema });
      return { ok: true, data: { ...result.data, model: result.model, usage: result.usage } as z.infer<typeof conceptOutput>, observations: { aiDecision: true, model: result.model, ...result.usage } };
    } catch (error) {
      return { ok: false, error: { code: (error as any)?.solCode || "AI_FAILED", message: error instanceof Error ? error.message : "Campaign concept failed.", retryable: Boolean((error as any)?.retryable) } };
    }
  }
};

const copyInput = z.object({ pathway: pathwayOutput, concept: conceptOutput.omit({ model: true, usage: true }).passthrough() });
const copyDataSchema = z.object({ instagramCaption: z.string(), shortCaption: z.string(), youtubeTitle: z.string(), youtubeDescription: z.string(), emailSubject: z.string(), emailBody: z.string(), commentReply: z.string(), keyword: z.string() });
const copyOutput = copyDataSchema.extend({ model: z.string(), usage: z.record(z.string(), z.number()) });
const copySchema = { type:"object", additionalProperties:false, required:["instagramCaption","shortCaption","youtubeTitle","youtubeDescription","emailSubject","emailBody","commentReply","keyword"], properties:{ instagramCaption:{type:"string"}, shortCaption:{type:"string"}, youtubeTitle:{type:"string"}, youtubeDescription:{type:"string"}, emailSubject:{type:"string"}, emailBody:{type:"string"}, commentReply:{type:"string"}, keyword:{type:"string"} } };
export const apostolicCampaignCopyTool: SolTool<z.infer<typeof copyInput>, z.infer<typeof copyOutput>> = {
  name: "apostolic.content.createCopyPackage", description: "Generate the reusable campaign copy package from approved doctrine and the approved campaign angle.", inputSchema: copyInput, outputSchema: copyOutput,
  permissions: ["execute"], supportedEnvironments: ["local","development","preview","production"], idempotency: "supported",
  async execute(input, context) {
    try {
      const result = await aiJson(context, { instructions: "Write Apostolic Guide campaign copy from the supplied Pathway and campaign concept. Scripture references and doctrinal statements must remain inside the supplied source. Do not quote verse text unless exact wording is supplied. Keep social copy concise and direct. Nothing is published by this step.", prompt: JSON.stringify(input), schemaName: "apostolic_campaign_copy", schema: copySchema });
      return { ok: true, data: { ...result.data, model: result.model, usage: result.usage } as z.infer<typeof copyOutput>, observations: { aiDecision: true, model: result.model, ...result.usage } };
    } catch (error) {
      return { ok: false, error: { code: (error as any)?.solCode || "AI_FAILED", message: error instanceof Error ? error.message : "Campaign copy failed.", retryable: Boolean((error as any)?.retryable) } };
    }
  }
};

const deckSlide = z.object({ kind: z.enum(["cover","scripture","statement","connection","cta"]), eyebrow: z.string(), title: z.string(), body: z.string(), reference: z.string() });
const deckInput = z.object({ pathway: pathwayOutput, concept: conceptOutput.passthrough(), copy: copyOutput.passthrough(), slideCount: z.number().int().min(4).max(10).default(8) });
const deckOutput = z.object({ title: z.string(), slides: z.array(deckSlide).min(4).max(10), model: z.string(), usage: z.record(z.string(), z.number()) });
function deckSchema(slideCount: number) { return { type:"object", additionalProperties:false, required:["title","slides"], properties:{ title:{type:"string"}, slides:{type:"array",minItems:slideCount,maxItems:slideCount,items:{type:"object",additionalProperties:false,required:["kind","eyebrow","title","body","reference"],properties:{kind:{type:"string",enum:["cover","scripture","statement","connection","cta"]},eyebrow:{type:"string"},title:{type:"string"},body:{type:"string"},reference:{type:"string"}}}} } }; }
export const apostolicCarouselDeckTool: SolTool<z.infer<typeof deckInput>, z.infer<typeof deckOutput>> = {
  name: "apostolic.carousel.createStructuredDeck", description: "Create a structured carousel deck from the campaign package.", inputSchema: deckInput, outputSchema: deckOutput,
  permissions: ["execute"], supportedEnvironments: ["local","development","preview","production"], idempotency: "supported",
  async execute(input, context) {
    try {
      const result = await aiJson(context, { instructions: `Create exactly ${input.slideCount} mobile-first carousel slides. Use one idea per slide. Use only the supplied approved Pathway for doctrine and references. Cover first, CTA last. Do not invent verse quotations.`, prompt: JSON.stringify(input), schemaName: "apostolic_carousel_deck", schema: deckSchema(input.slideCount) });
      return { ok: true, data: { ...result.data, model: result.model, usage: result.usage } as z.infer<typeof deckOutput>, observations: { aiDecision: true, model: result.model, ...result.usage } };
    } catch (error) {
      return { ok: false, error: { code: (error as any)?.solCode || "AI_FAILED", message: error instanceof Error ? error.message : "Carousel deck failed.", retryable: Boolean((error as any)?.retryable) } };
    }
  }
};

const doctrineInput = z.object({ pathway: pathwayOutput, content: z.unknown() });
const doctrineOutput = z.object({ status: z.enum(["pass","warning","blocked"]), issues: z.array(z.string()), sourceRefs: z.array(z.string()), explanation: z.string(), model: z.string(), usage: z.record(z.string(), z.number()) });
const doctrineSchema = { type:"object", additionalProperties:false, required:["status","issues","sourceRefs","explanation"], properties:{ status:{type:"string",enum:["pass","warning","blocked"]}, issues:{type:"array",items:{type:"string"}}, sourceRefs:{type:"array",items:{type:"string"}}, explanation:{type:"string"} } };
export const apostolicDoctrineCheckTool: SolTool<z.infer<typeof doctrineInput>, z.infer<typeof doctrineOutput>> = {
  name: "apostolic.doctrine.check", description: "Compare generated campaign language against the approved Pathway and flag unsupported theology.", inputSchema: doctrineInput, outputSchema: doctrineOutput,
  permissions: ["execute"], supportedEnvironments: ["local","development","preview","production"], idempotency: "supported",
  async execute(input, context) {
    try {
      const result = await aiJson(context, { instructions: "You are the Apostolic Guide doctrine checker. The supplied Pathway is the only canonical source for this check. PASS only if the generated content stays within it. WARNING for wording that needs clarification but does not contradict it. BLOCKED for unsupported doctrine, invented Scripture wording, claims outside the source, or theological drift. Do not improve or rewrite the source. Return sourceRefs only from the supplied Pathway.", prompt: JSON.stringify(input), schemaName: "apostolic_doctrine_check", schema: doctrineSchema });
      return { ok: true, data: { ...result.data, model: result.model, usage: result.usage } as z.infer<typeof doctrineOutput>, observations: { aiDecision: true, model: result.model, ...result.usage, doctrineStatus: result.data.status } };
    } catch (error) {
      return { ok: false, error: { code: (error as any)?.solCode || "AI_FAILED", message: error instanceof Error ? error.message : "Doctrine check failed.", retryable: Boolean((error as any)?.retryable) } };
    }
  }
};

const campaignCreateInput = z.object({ pathway: pathwayOutput, concept: conceptOutput.passthrough(), copy: copyOutput.passthrough() });
const campaignCreateOutput = z.object({ campaignId: z.string().uuid(), title: z.string(), status: z.literal("draft"), route: z.string() });
export const apostolicCampaignCreateDraftTool: SolTool<z.infer<typeof campaignCreateInput>, z.infer<typeof campaignCreateOutput>> = {
  name: "apostolic.campaign.createDraft", description: "Persist a draft campaign record. This never publishes anything.", inputSchema: campaignCreateInput, outputSchema: campaignCreateOutput,
  permissions: ["write"], supportedEnvironments: ["preview","production","development"], idempotency: "required",
  async execute(input, context) {
    try {
      const existing = await service().from("studio_campaigns").select("id,title,status").eq("runtime_run_id", context.runId).eq("pathway_slug", input.pathway.slug).maybeSingle();
      if (existing.error) throw existing.error;
      if (existing.data) return { ok: true, data: { campaignId: String(existing.data.id), title: String(existing.data.title), status: "draft", route: `/admin/sol/campaigns/${existing.data.id}` } };
      const inserted = await service().from("studio_campaigns").insert({ pathway_slug: input.pathway.slug, title: String(input.concept.title || `${input.pathway.title} Campaign`), status: "draft", strategy: input.concept, copy_package: input.copy, runtime_run_id: context.runId }).select("id,title").single();
      if (inserted.error) throw inserted.error;
      return { ok: true, data: { campaignId: String(inserted.data.id), title: String(inserted.data.title), status: "draft", route: `/admin/sol/campaigns/${inserted.data.id}` } };
    } catch (error) {
      return { ok: false, error: { code: "CAMPAIGN_CREATE_FAILED", message: error instanceof Error ? error.message : "Campaign draft failed.", retryable: false } };
    }
  }
};

const renderInput = z.object({ pathway: pathwayOutput, campaignId: z.string().uuid(), deck: deckOutput.passthrough() });
const renderOutput = z.object({ campaignId: z.string().uuid(), slideCount: z.number().int(), width: z.literal(1080), height: z.literal(1350), slides: z.array(z.object({ id: z.string().uuid(), ordinal: z.number().int(), route: z.string(), title: z.string() })), artifacts: z.array(z.object({ type: z.string(), title: z.string(), storageType: z.literal("database"), location: z.string(), metadata: z.record(z.string(), z.unknown()), verificationStatus: z.enum(["pending","passed","failed"]) })) });
export const apostolicCarouselRenderTool: SolTool<z.infer<typeof renderInput>, z.infer<typeof renderOutput>> = {
  name: "apostolic.carousel.render", description: "Deterministically render structured carousel slides into durable SVG image assets.", inputSchema: renderInput, outputSchema: renderOutput,
  permissions: ["write"], supportedEnvironments: ["development","preview","production"], idempotency: "required",
  async execute(input) {
    try {
      const db = service();
      const existing = await db.from("studio_campaign_artifacts").select("id,ordinal,title").eq("campaign_id", input.campaignId).eq("artifact_type", "carousel_slide").order("ordinal", { ascending: true });
      if (existing.error) throw existing.error;
      let rows = existing.data ?? [];
      if (rows.length !== input.deck.slides.length) {
        if (rows.length) await db.from("studio_campaign_artifacts").delete().eq("campaign_id", input.campaignId).eq("artifact_type", "carousel_slide");
        const inserts = input.deck.slides.map((slide, index) => {
          const titleLines = wrap(slide.title, 24, 4);
          const bodyLines = wrap(slide.body, 48, 6);
          const titleSvg = titleLines.map((line, lineIndex) => `<text x="88" y="${380 + lineIndex * 90}" font-size="72" font-family="Arial,Helvetica,sans-serif" font-weight="800" fill="#F7F4ED">${escapeXml(line)}</text>`).join("");
          const bodyStart = 380 + titleLines.length * 90 + 72;
          const bodySvg = bodyLines.map((line, lineIndex) => `<text x="88" y="${bodyStart + lineIndex * 48}" font-size="32" font-family="Arial,Helvetica,sans-serif" fill="#D7DCE6">${escapeXml(line)}</text>`).join("");
          const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#071A38"/><stop offset="1" stop-color="#182B50"/></linearGradient></defs><rect width="1080" height="1350" fill="url(#g)"/><rect x="70" y="70" width="940" height="1210" rx="22" fill="none" stroke="#A7212D" stroke-width="3" opacity=".72"/><text x="88" y="154" font-size="25" font-family="Arial,Helvetica,sans-serif" font-weight="700" fill="#D94A56" letter-spacing="3">${escapeXml(slide.eyebrow.toUpperCase())}</text>${titleSvg}${bodySvg}<text x="88" y="1190" font-size="28" font-family="Georgia,serif" fill="#F7F4ED">${escapeXml(slide.reference)}</text><text x="88" y="1244" font-size="19" font-family="Arial,Helvetica,sans-serif" fill="#AEB7CA">APOSTOLIC GUIDE · ${index + 1}/${input.deck.slides.length}</text></svg>`;
          return { campaign_id: input.campaignId, pathway_slug: input.pathway.slug, artifact_type: "carousel_slide", title: slide.title, mime_type: "image/svg+xml", content_text: svg, content_json: slide, width: 1080, height: 1350, ordinal: index + 1, verification_status: "passed", metadata: { kind: slide.kind, reference: slide.reference } };
        });
        const inserted = await db.from("studio_campaign_artifacts").insert(inserts).select("id,ordinal,title");
        if (inserted.error) throw inserted.error;
        rows = inserted.data ?? [];
      }
      const slides = rows.map((row) => ({ id: String(row.id), ordinal: Number(row.ordinal), route: `/api/admin/sol/campaign-artifacts/${row.id}`, title: String(row.title) }));
      return { ok: true, data: { campaignId: input.campaignId, slideCount: slides.length, width: 1080, height: 1350, slides, artifacts: [{ type: "instagram_carousel", title: `${input.pathway.title} carousel`, storageType: "database", location: `/admin/sol/campaigns/${input.campaignId}`, metadata: { campaignId: input.campaignId, slideIds: slides.map((slide) => slide.id), slideCount: slides.length, width: 1080, height: 1350 }, verificationStatus: "passed" }] } };
    } catch (error) {
      return { ok: false, error: { code: "CAROUSEL_RENDER_FAILED", message: error instanceof Error ? error.message : "Carousel render failed.", retryable: false } };
    }
  }
};

const packageInput = z.object({ pathway: pathwayOutput, campaignId: z.string().uuid(), copy: copyOutput.passthrough() });
const simpleArtifactOutput = z.object({ id: z.string().uuid(), route: z.string(), artifacts: z.array(z.object({ type: z.string(), title: z.string(), storageType: z.literal("database"), location: z.string(), metadata: z.record(z.string(), z.unknown()), verificationStatus: z.enum(["pending","passed","failed"]) })) });
async function saveJsonArtifact(input: { campaignId: string; pathwaySlug: string; artifactType: string; title: string; content: Record<string, unknown> }) {
  const db = service();
  const existing = await db.from("studio_campaign_artifacts").select("id").eq("campaign_id", input.campaignId).eq("artifact_type", input.artifactType).limit(1).maybeSingle();
  if (existing.error) throw existing.error;
  let id = existing.data?.id ? String(existing.data.id) : "";
  if (id) {
    const updated = await db.from("studio_campaign_artifacts").update({ title: input.title, content_json: input.content, verification_status: "passed" }).eq("id", id);
    if (updated.error) throw updated.error;
  } else {
    const inserted = await db.from("studio_campaign_artifacts").insert({ campaign_id: input.campaignId, pathway_slug: input.pathwaySlug, artifact_type: input.artifactType, title: input.title, mime_type: "application/json", content_json: input.content, verification_status: "passed" }).select("id").single();
    if (inserted.error) throw inserted.error;
    id = String(inserted.data.id);
  }
  return id;
}

export const apostolicSocialDraftTool: SolTool<z.infer<typeof packageInput>, z.infer<typeof simpleArtifactOutput>> = {
  name: "apostolic.social.createDraft", description: "Persist social copy as a campaign draft artifact without publishing.", inputSchema: packageInput, outputSchema: simpleArtifactOutput,
  permissions: ["write"], supportedEnvironments: ["development","preview","production"], idempotency: "required",
  async execute(input) {
    try {
      const content = { instagramCaption: input.copy.instagramCaption, shortCaption: input.copy.shortCaption, commentReply: input.copy.commentReply, keyword: input.copy.keyword, published: false };
      const id = await saveJsonArtifact({ campaignId: input.campaignId, pathwaySlug: input.pathway.slug, artifactType: "social_copy", title: `${input.pathway.title} social copy`, content });
      return { ok: true, data: { id, route: `/admin/sol/campaigns/${input.campaignId}`, artifacts: [{ type: "social_copy", title: `${input.pathway.title} social copy`, storageType: "database", location: `/admin/sol/campaigns/${input.campaignId}`, metadata: { campaignId: input.campaignId, artifactId: id, published: false }, verificationStatus: "passed" }] } };
    } catch (error) { return { ok: false, error: { code: "SOCIAL_DRAFT_FAILED", message: error instanceof Error ? error.message : "Social draft failed.", retryable: false } }; }
  }
};

export const apostolicEmailDraftTool: SolTool<z.infer<typeof packageInput>, z.infer<typeof simpleArtifactOutput>> = {
  name: "apostolic.email.createDraft", description: "Persist email copy as a campaign draft artifact without sending.", inputSchema: packageInput, outputSchema: simpleArtifactOutput,
  permissions: ["write"], supportedEnvironments: ["development","preview","production"], idempotency: "required",
  async execute(input) {
    try {
      const content = { subject: input.copy.emailSubject, body: input.copy.emailBody, sent: false };
      const id = await saveJsonArtifact({ campaignId: input.campaignId, pathwaySlug: input.pathway.slug, artifactType: "email_draft", title: `${input.pathway.title} email draft`, content });
      return { ok: true, data: { id, route: `/admin/sol/campaigns/${input.campaignId}`, artifacts: [{ type: "email_draft", title: `${input.pathway.title} email draft`, storageType: "database", location: `/admin/sol/campaigns/${input.campaignId}`, metadata: { campaignId: input.campaignId, artifactId: id, sent: false }, verificationStatus: "passed" }] } };
    } catch (error) { return { ok: false, error: { code: "EMAIL_DRAFT_FAILED", message: error instanceof Error ? error.message : "Email draft failed.", retryable: false } }; }
  }
};

export const apostolicYoutubeDraftTool: SolTool<z.infer<typeof packageInput>, z.infer<typeof simpleArtifactOutput>> = {
  name: "apostolic.video.prepare", description: "Prepare a YouTube package and attach existing approved audio/video state when available. It does not publish.", inputSchema: packageInput, outputSchema: simpleArtifactOutput,
  permissions: ["write"], supportedEnvironments: ["development","preview","production"], idempotency: "required",
  async execute(input) {
    try {
      const db = service();
      const [audio, script, project] = await Promise.all([
        db.from("pathway_audio_assets").select("audio_url,content_hash").eq("pathway_slug", input.pathway.slug).maybeSingle(),
        db.from("pathway_audio_scripts").select("script_hash,status,checker_status,checked_script_hash").eq("pathway_slug", input.pathway.slug).maybeSingle(),
        db.from("pathway_video_projects").select("id,status").eq("pathway_slug", input.pathway.slug).maybeSingle()
      ]);
      if (audio.error) throw audio.error; if (script.error) throw script.error; if (project.error) throw project.error;
      const approvedAudio = Boolean(audio.data?.audio_url && script.data?.status === "approved" && script.data?.checker_status === "passed" && script.data?.checked_script_hash === script.data?.script_hash && audio.data?.content_hash === script.data?.script_hash);
      const content = { youtubeTitle: input.copy.youtubeTitle, youtubeDescription: input.copy.youtubeDescription, approvedAudioAvailable: approvedAudio, audioUrl: approvedAudio ? audio.data?.audio_url : null, videoProjectId: project.data?.id ?? null, videoProjectStatus: project.data?.status ?? null, published: false };
      const id = await saveJsonArtifact({ campaignId: input.campaignId, pathwaySlug: input.pathway.slug, artifactType: "youtube_package", title: `${input.pathway.title} YouTube package`, content });
      return { ok: true, data: { id, route: `/admin/sol/campaigns/${input.campaignId}`, artifacts: [{ type: "youtube_package", title: `${input.pathway.title} YouTube package`, storageType: "database", location: `/admin/sol/campaigns/${input.campaignId}`, metadata: { campaignId: input.campaignId, artifactId: id, approvedAudioAvailable: approvedAudio, published: false }, verificationStatus: "passed" }] } };
    } catch (error) { return { ok: false, error: { code: "VIDEO_PREPARE_FAILED", message: error instanceof Error ? error.message : "Video package failed.", retryable: false } }; }
  }
};

const automationInput = z.object({ pathway: pathwayOutput, campaignId: z.string().uuid(), copy: copyOutput.passthrough() });
const automationOutput = z.object({ automationId: z.string().uuid(), enabled: z.literal(false), route: z.string(), artifacts: z.array(z.object({ type: z.string(), title: z.string(), storageType: z.literal("database"), location: z.string(), metadata: z.record(z.string(), z.unknown()), verificationStatus: z.literal("passed") })) });
export const apostolicKeywordAutomationDraftTool: SolTool<z.infer<typeof automationInput>, z.infer<typeof automationOutput>> = {
  name: "apostolic.social.createKeywordAutomationDraft", description: "Create or reuse a disabled Instagram comment-keyword automation draft.", inputSchema: automationInput, outputSchema: automationOutput,
  permissions: ["write"], supportedEnvironments: ["development","preview","production"], idempotency: "required",
  async execute(input) {
    try {
      const db = service();
      const keyword = input.copy.keyword.trim().toLowerCase();
      const name = `${input.pathway.title} Pathway · ${keyword.toUpperCase()}`;
      const existing = await db.from("social_automations").select("id,enabled").eq("name", name).eq("enabled", false).maybeSingle();
      if (existing.error) throw existing.error;
      let id = existing.data?.id ? String(existing.data.id) : "";
      if (!id) {
        const inserted = await db.from("social_automations").insert({ name, platform: "instagram", trigger_type: "comment_keyword", keywords: [keyword], match_type: "exact", reply_text: input.copy.commentReply, destination_url: `https://www.apostolicguide.com/pathways/${input.pathway.slug}`, enabled: false, created_by: "SOL Runtime" }).select("id").single();
        if (inserted.error) throw inserted.error;
        id = String(inserted.data.id);
      }
      await db.from("studio_campaigns").update({ keyword_automation_id: id }).eq("id", input.campaignId);
      return { ok: true, data: { automationId: id, enabled: false, route: "/admin/social", artifacts: [{ type: "keyword_automation_draft", title: `${input.pathway.title} keyword automation`, storageType: "database", location: `/admin/sol/campaigns/${input.campaignId}`, metadata: { campaignId: input.campaignId, automationId: id, enabled: false, keyword }, verificationStatus: "passed" }] } };
    } catch (error) { return { ok: false, error: { code: "AUTOMATION_DRAFT_FAILED", message: error instanceof Error ? error.message : "Automation draft failed.", retryable: false } }; }
  }
};

const linkInput = z.object({ urls: z.array(z.string().url()).min(1).max(20) });
const linkOutput = z.object({ passed: z.boolean(), total: z.number().int(), valid: z.number().int(), results: z.array(z.object({ url: z.string(), status: z.number().int().nullable(), ok: z.boolean(), error: z.string().nullable() })) });
export const apostolicValidateLinksTool: SolTool<z.infer<typeof linkInput>, z.infer<typeof linkOutput>> = {
  name: "apostolic.publishing.validateLinks", description: "Validate campaign destination links without publishing anything.", inputSchema: linkInput, outputSchema: linkOutput,
  permissions: ["read"], supportedEnvironments: ["development","preview","production"], idempotency: "not_required",
  async execute(input, context) {
    const results = await Promise.all(input.urls.map(async (raw) => {
      try {
        const url = await assertSolPublicHttps(raw);
        const response = await fetch(url, { method: "HEAD", redirect: "follow", cache: "no-store", signal: context.signal });
        return { url: raw, status: response.status, ok: response.ok, error: null };
      } catch (error) { return { url: raw, status: null, ok: false, error: error instanceof Error ? error.message : "Link failed." }; }
    }));
    const valid = results.filter((row) => row.ok).length;
    return { ok: true, data: { passed: valid === results.length, total: results.length, valid, results }, observations: { valid, total: results.length } };
  }
};

const finalizeInput = z.object({ campaignId: z.string().uuid(), pathway: pathwayOutput, concept: conceptOutput.passthrough(), copy: copyOutput.passthrough(), doctrine: doctrineOutput.passthrough(), links: linkOutput, social: simpleArtifactOutput, email: simpleArtifactOutput, youtube: simpleArtifactOutput, automation: automationOutput, carousel: renderOutput });
const finalizeOutput = z.object({ campaignId: z.string().uuid(), route: z.string(), status: z.literal("review"), summary: z.object({ deterministicArtifacts: z.number().int(), doctrineStatus: z.string(), validLinks: z.string(), published: z.literal(false) }), artifacts: z.array(z.object({ type: z.string(), title: z.string(), storageType: z.literal("database"), location: z.string(), metadata: z.record(z.string(), z.unknown()), verificationStatus: z.enum(["pending","passed","failed"]) })) });
export const apostolicCampaignFinalizeTool: SolTool<z.infer<typeof finalizeInput>, z.infer<typeof finalizeOutput>> = {
  name: "apostolic.campaign.finalizeDraft", description: "Assemble the unified campaign review package and move the draft to review. Nothing is published.", inputSchema: finalizeInput, outputSchema: finalizeOutput,
  permissions: ["write"], supportedEnvironments: ["development","preview","production"], idempotency: "required",
  async execute(input) {
    try {
      const route = `/admin/sol/campaigns/${input.campaignId}`;
      const db = service();
      const updated = await db.from("studio_campaigns").update({ status: "review", strategy: input.concept, copy_package: input.copy, social_package: { artifactId: input.social.id }, youtube_package: { artifactId: input.youtube.id }, email_package: { artifactId: input.email.id }, link_report: input.links, doctrine_report: input.doctrine, keyword_automation_id: input.automation.automationId }).eq("id", input.campaignId).select("id").single();
      if (updated.error) throw updated.error;
      const countResult = await db.from("studio_campaign_artifacts").select("id", { count: "exact", head: true }).eq("campaign_id", input.campaignId);
      if (countResult.error) throw countResult.error;
      const deterministicArtifacts = Number(countResult.count) || 0;
      return { ok: true, data: { campaignId: input.campaignId, route, status: "review", summary: { deterministicArtifacts, doctrineStatus: input.doctrine.status, validLinks: `${input.links.valid}/${input.links.total}`, published: false }, artifacts: [{ type: "campaign_review_package", title: `${input.pathway.title} campaign`, storageType: "database", location: route, metadata: { campaignId: input.campaignId, doctrineStatus: input.doctrine.status, validLinks: `${input.links.valid}/${input.links.total}`, deterministicArtifacts, published: false }, verificationStatus: input.doctrine.status === "blocked" || !input.links.passed ? "pending" : "passed" }] } };
    } catch (error) { return { ok: false, error: { code: "CAMPAIGN_FINALIZE_FAILED", message: error instanceof Error ? error.message : "Campaign finalization failed.", retryable: false } }; }
  }
};
