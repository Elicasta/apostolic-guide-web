import { z } from "zod";
import { pathwayBySlug } from "../../pathway-catalog";
import { solAiGenerateJsonTool } from "../../sol-core/tools/ai";
import type { SolTool, SolToolContext } from "../../sol-core/tools/types";
import { createServiceClient } from "../../supabase";

const inputSchema = z.object({ reviewId: z.string().uuid(), note: z.string().min(1).max(2000), sourceTaskId: z.string().uuid() });
const artifactSchema = z.object({ type: z.string(), title: z.string(), storageType: z.literal("database"), location: z.string(), metadata: z.record(z.string(), z.unknown()), verificationStatus: z.literal("passed") });
const outputSchema = z.object({ campaignId: z.string().uuid(), repaired: z.literal(true), doctrineStatus: z.literal("pass"), route: z.string(), artifacts: z.array(artifactSchema) });

function service() {
  const client = createServiceClient();
  if (!client) throw new Error("Apostolic Guide database is not configured.");
  return client;
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
  if (lines.join(" ").split(/\s+/).length < words.length && lines.length) lines[lines.length - 1] = `${lines[lines.length - 1].replace(/[.…]+$/, "")}…`;
  return lines;
}

function slideSvg(slide: { eyebrow: string; title: string; body: string; reference: string }, index: number, total: number) {
  const titleLines = wrap(slide.title, 24, 4);
  const bodyLines = wrap(slide.body, 48, 6);
  const titleSvg = titleLines.map((line, lineIndex) => `<text x="88" y="${380 + lineIndex * 90}" font-size="72" font-family="Arial,Helvetica,sans-serif" font-weight="800" fill="#F7F4ED">${escapeXml(line)}</text>`).join("");
  const bodyStart = 380 + titleLines.length * 90 + 72;
  const bodySvg = bodyLines.map((line, lineIndex) => `<text x="88" y="${bodyStart + lineIndex * 48}" font-size="32" font-family="Arial,Helvetica,sans-serif" fill="#D7DCE6">${escapeXml(line)}</text>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#071A38"/><stop offset="1" stop-color="#182B50"/></linearGradient></defs><rect width="1080" height="1350" fill="url(#g)"/><rect x="70" y="70" width="940" height="1210" rx="22" fill="none" stroke="#A7212D" stroke-width="3" opacity=".72"/><text x="88" y="154" font-size="25" font-family="Arial,Helvetica,sans-serif" font-weight="700" fill="#D94A56" letter-spacing="3">${escapeXml(slide.eyebrow.toUpperCase())}</text>${titleSvg}${bodySvg}<text x="88" y="1190" font-size="28" font-family="Georgia,serif" fill="#F7F4ED">${escapeXml(slide.reference)}</text><text x="88" y="1244" font-size="19" font-family="Arial,Helvetica,sans-serif" fill="#AEB7CA">APOSTOLIC GUIDE · ${index + 1}/${total}</text></svg>`;
}

async function aiJson(context: SolToolContext, instructions: string, prompt: string, name: string, schema: Record<string, unknown>) {
  const result = await solAiGenerateJsonTool.execute({ instructions, prompt, schemaName: name, schema, effort: "medium" }, context);
  if (!result.ok) throw Object.assign(new Error(result.error.message), { code: result.error.code, retryable: result.error.retryable });
  return result.data;
}

const repairSchema = {
  type: "object", additionalProperties: false,
  required: ["instagramCaption","shortCaption","youtubeTitle","youtubeDescription","emailSubject","emailBody","commentReply","keyword","slides"],
  properties: {
    instagramCaption:{type:"string"}, shortCaption:{type:"string"}, youtubeTitle:{type:"string"}, youtubeDescription:{type:"string"}, emailSubject:{type:"string"}, emailBody:{type:"string"}, commentReply:{type:"string"}, keyword:{type:"string"},
    slides:{type:"array",minItems:4,maxItems:10,items:{type:"object",additionalProperties:false,required:["kind","eyebrow","title","body","reference"],properties:{kind:{type:"string",enum:["cover","scripture","statement","connection","cta"]},eyebrow:{type:"string"},title:{type:"string"},body:{type:"string"},reference:{type:"string"}}}}
  }
};
const doctrineSchema = { type:"object", additionalProperties:false, required:["status","issues","sourceRefs","explanation"], properties:{status:{type:"string",enum:["pass","warning","blocked"]},issues:{type:"array",items:{type:"string"}},sourceRefs:{type:"array",items:{type:"string"}},explanation:{type:"string"}} };

export const apostolicCampaignRepairTool: SolTool<z.infer<typeof inputSchema>, z.infer<typeof outputSchema>> = {
  name: "apostolic.campaign.repairFromReview",
  description: "Apply explicit human review feedback to a campaign, re-check it against the canonical Pathway, and rebuild affected draft artifacts.",
  inputSchema,
  outputSchema,
  permissions: ["write"],
  supportedEnvironments: ["development","preview","production"],
  idempotency: "required",
  async execute(input, context) {
    try {
      const db = service();
      const campaignResult = await db.from("studio_campaigns").select("*").eq("runtime_run_id", context.runId).maybeSingle();
      if (campaignResult.error) throw campaignResult.error;
      if (!campaignResult.data) throw new Error("The repair run has no campaign package to repair.");
      const campaign = campaignResult.data;
      const pathway = pathwayBySlug(String(campaign.pathway_slug));
      if (!pathway) throw new Error("The campaign Pathway is no longer canonical.");
      const artifactResult = await db.from("studio_campaign_artifacts").select("id,artifact_type,content_json,ordinal,title").eq("campaign_id", campaign.id).order("ordinal", { ascending: true });
      if (artifactResult.error) throw artifactResult.error;
      const existingSlides = (artifactResult.data ?? []).filter((row) => row.artifact_type === "carousel_slide").map((row) => row.content_json);
      const canonical = { slug: pathway.slug, title: pathway.title, summary: pathway.summary, steps: pathway.steps.map((step) => ({ title: step.title, reference: step.reference, explanation: step.explanation })) };
      const packet = { reviewNote: input.note, canonicalPathway: canonical, currentCopy: campaign.copy_package, currentStrategy: campaign.strategy, currentSlides: existingSlides };
      const repaired = await aiJson(context,
        "You are repairing an Apostolic Guide campaign because a human reviewer requested changes. Follow the review note exactly where it does not conflict with the canonical Pathway. The Pathway is the only doctrinal source. Do not add Scripture quotations, doctrinal claims, history, lexical claims, or interpretations outside it. Preserve good material that the reviewer did not ask to change. Return the complete replacement copy package and complete carousel deck.",
        JSON.stringify(packet), "apostolic_campaign_repair", repairSchema);
      const repairedContent = repaired.data;
      const doctrine = await aiJson(context,
        "You are the Apostolic Guide doctrine checker. Compare the repaired content only to the supplied canonical Pathway. PASS only if every theological claim and Scripture reference stays within that source. WARNING means clarification is still needed. BLOCKED means unsupported doctrine, invented Scripture wording, or drift. Do not rewrite the source.",
        JSON.stringify({ canonicalPathway: canonical, repairedContent }), "apostolic_campaign_repair_doctrine", doctrineSchema);
      const doctrineData = doctrine.data as Record<string, unknown>;
      if (doctrineData.status !== "pass") {
        return { ok: false, error: { code: "CONTENT_FAILURE", message: `Repair failed doctrine verification: ${String(doctrineData.explanation || doctrineData.status || "unknown")}`, retryable: false }, observations: { doctrineStatus: doctrineData.status, issues: doctrineData.issues } };
      }

      const copy = { ...repairedContent, slides: undefined } as Record<string, unknown>;
      delete copy.slides;
      const campaignUpdate = await db.from("studio_campaigns").update({ status: "review", copy_package: copy, doctrine_report: { ...doctrineData, repairedFromReview: input.reviewId, reviewNote: input.note } }).eq("id", campaign.id);
      if (campaignUpdate.error) throw campaignUpdate.error;

      const slides = Array.isArray(repairedContent.slides) ? repairedContent.slides as Array<Record<string, unknown>> : [];
      const oldSlides = (artifactResult.data ?? []).filter((row) => row.artifact_type === "carousel_slide");
      for (let index = 0; index < slides.length; index += 1) {
        const slide = slides[index];
        const row = oldSlides[index];
        const normalized = { kind: String(slide.kind || "statement"), eyebrow: String(slide.eyebrow || ""), title: String(slide.title || ""), body: String(slide.body || ""), reference: String(slide.reference || "") };
        const values = { title: normalized.title, content_text: slideSvg(normalized, index, slides.length), content_json: normalized, width: 1080, height: 1350, ordinal: index + 1, verification_status: "passed", metadata: { kind: normalized.kind, reference: normalized.reference, repairedFromReview: input.reviewId } };
        if (row) {
          const update = await db.from("studio_campaign_artifacts").update(values).eq("id", row.id);
          if (update.error) throw update.error;
        } else {
          const insert = await db.from("studio_campaign_artifacts").insert({ campaign_id: campaign.id, pathway_slug: pathway.slug, artifact_type: "carousel_slide", mime_type: "image/svg+xml", ...values });
          if (insert.error) throw insert.error;
        }
      }
      if (oldSlides.length > slides.length) {
        const extraIds = oldSlides.slice(slides.length).map((row) => row.id);
        const remove = await db.from("studio_campaign_artifacts").delete().in("id", extraIds);
        if (remove.error) throw remove.error;
      }

      const updates: Array<{ type: string; content: Record<string, unknown> }> = [
        { type: "social_copy", content: { instagramCaption: copy.instagramCaption, shortCaption: copy.shortCaption, commentReply: copy.commentReply, keyword: copy.keyword, published: false, repairedFromReview: input.reviewId } },
        { type: "email_draft", content: { subject: copy.emailSubject, body: copy.emailBody, sent: false, repairedFromReview: input.reviewId } },
        { type: "youtube_package", content: { youtubeTitle: copy.youtubeTitle, youtubeDescription: copy.youtubeDescription, published: false, repairedFromReview: input.reviewId } }
      ];
      for (const update of updates) {
        const result = await db.from("studio_campaign_artifacts").update({ content_json: update.content, verification_status: "passed" }).eq("campaign_id", campaign.id).eq("artifact_type", update.type);
        if (result.error) throw result.error;
      }

      const route = `/admin/sol/campaigns/${campaign.id}`;
      return { ok: true, data: { campaignId: String(campaign.id), repaired: true, doctrineStatus: "pass", route, artifacts: [{ type: "campaign_repair", title: `${campaign.title} repaired package`, storageType: "database", location: route, metadata: { campaignId: campaign.id, reviewId: input.reviewId, reviewNote: input.note, slideCount: slides.length }, verificationStatus: "passed" }] }, observations: { repaired: true, doctrineStatus: "pass", slideCount: slides.length, aiCalls: 2, aiTokens: Number(repaired.usage.totalTokens || 0) + Number(doctrine.usage.totalTokens || 0) } };
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code || "REPAIR_FAILED") : "REPAIR_FAILED";
      const retryable = Boolean(error && typeof error === "object" && "retryable" in error && (error as { retryable?: unknown }).retryable === true);
      return { ok: false, error: { code, message: error instanceof Error ? error.message : "Campaign repair failed.", retryable } };
    }
  }
};
