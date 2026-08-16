import type { SolTaskDefinition } from "../../sol-core/types/runtime";
import type { SolWorkflowDefinition } from "../../sol-core/workflows/registry";

const retry = { maxAttempts: 3, strategy: "exponential" as const, baseDelayMs: 2_000, maxDelayMs: 60_000 };
function task(input: Partial<SolTaskDefinition> & Pick<SolTaskDefinition, "id" | "name" | "input" | "dependsOn" | "permission">): SolTaskDefinition {
  return { retryPolicy: retry, timeoutMs: 180_000, ...input };
}

export const pathwayCampaignWorkflow: SolWorkflowDefinition = {
  key: "apostolic.pathway_campaign.prepare",
  version: 1,
  description: "Prepare one unified Pathway campaign from canonical doctrine through verified drafts and human review. Nothing is published.",
  trusted: true,
  createTasks(input) {
    const slug = String(input.pathway || input.slug || "");
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("A valid Pathway slug is required.");
    const pathwayUrl = `https://www.apostolicguide.com/pathways/${slug}`;
    return [
      task({ id: "load_pathway", name: "Load approved Pathway", tool: "apostolic.pathways.get", input: { slug }, dependsOn: [], permission: "read" }),
      task({ id: "verify_source", name: "Verify canonical doctrine source", tool: "apostolic.doctrine.verifySource", input: { pathway: { $from: "load_pathway" } }, dependsOn: ["load_pathway"], permission: "read" }),
      task({ id: "campaign_concept", name: "Choose campaign strategy", tool: "apostolic.content.createCampaignConcept", input: { pathway: { $from: "load_pathway" } }, dependsOn: ["verify_source"], permission: "execute", idempotency: { required: true, key: `${slug}:campaign-concept:v1` } }),
      task({ id: "campaign_copy", name: "Generate campaign copy", tool: "apostolic.content.createCopyPackage", input: { pathway: { $from: "load_pathway" }, concept: { $from: "campaign_concept" } }, dependsOn: ["campaign_concept"], permission: "execute", idempotency: { required: true, key: `${slug}:campaign-copy:v1` } }),
      task({ id: "create_campaign", name: "Create campaign draft", tool: "apostolic.campaign.createDraft", input: { pathway: { $from: "load_pathway" }, concept: { $from: "campaign_concept" }, copy: { $from: "campaign_copy" } }, dependsOn: ["campaign_copy"], permission: "write", idempotency: { required: true, key: `${slug}:campaign-record:v1` } }),
      task({ id: "create_carousel_deck", name: "Create carousel structure", tool: "apostolic.carousel.createStructuredDeck", input: { pathway: { $from: "load_pathway" }, concept: { $from: "campaign_concept" }, copy: { $from: "campaign_copy" }, slideCount: 8 }, dependsOn: ["campaign_copy"], permission: "execute", idempotency: { required: true, key: `${slug}:carousel-deck:v1` } }),
      task({ id: "doctrine_check", name: "Check campaign doctrine", tool: "apostolic.doctrine.check", input: { pathway: { $from: "load_pathway" }, content: { deck: { $from: "create_carousel_deck" }, copy: { $from: "campaign_copy" } } }, dependsOn: ["create_carousel_deck"], permission: "execute", verifier: "doctrine.passed", idempotency: { required: true, key: `${slug}:doctrine-check:v1` } }),
      task({ id: "render_carousel", name: "Render carousel assets", tool: "apostolic.carousel.render", input: { pathway: { $from: "load_pathway" }, campaignId: { $from: "create_campaign.campaignId" }, deck: { $from: "create_carousel_deck" } }, dependsOn: ["create_campaign","doctrine_check"], permission: "write", verifier: "carousel.render", idempotency: { required: true, key: `${slug}:carousel-render:v1` }, timeoutMs: 120_000 }),
      task({ id: "social_draft", name: "Prepare social copy", tool: "apostolic.social.createDraft", input: { pathway: { $from: "load_pathway" }, campaignId: { $from: "create_campaign.campaignId" }, copy: { $from: "campaign_copy" } }, dependsOn: ["create_campaign","doctrine_check"], permission: "write", idempotency: { required: true, key: `${slug}:social-draft:v1` } }),
      task({ id: "email_draft", name: "Prepare email copy", tool: "apostolic.email.createDraft", input: { pathway: { $from: "load_pathway" }, campaignId: { $from: "create_campaign.campaignId" }, copy: { $from: "campaign_copy" } }, dependsOn: ["create_campaign","doctrine_check"], permission: "write", idempotency: { required: true, key: `${slug}:email-draft:v1` } }),
      task({ id: "youtube_package", name: "Prepare YouTube package", tool: "apostolic.video.prepare", input: { pathway: { $from: "load_pathway" }, campaignId: { $from: "create_campaign.campaignId" }, copy: { $from: "campaign_copy" } }, dependsOn: ["create_campaign","doctrine_check"], permission: "write", idempotency: { required: true, key: `${slug}:youtube-package:v1` } }),
      task({ id: "keyword_automation", name: "Create disabled keyword automation draft", tool: "apostolic.social.createKeywordAutomationDraft", input: { pathway: { $from: "load_pathway" }, campaignId: { $from: "create_campaign.campaignId" }, copy: { $from: "campaign_copy" } }, dependsOn: ["create_campaign","doctrine_check"], permission: "write", idempotency: { required: true, key: `${slug}:keyword-automation:v1` } }),
      task({ id: "validate_links", name: "Validate campaign links", tool: "apostolic.publishing.validateLinks", input: { urls: [pathwayUrl, "https://www.apostolicguide.com/pathways"] }, dependsOn: ["load_pathway"], permission: "read", verifier: "links.passed" }),
      task({ id: "finalize_campaign", name: "Assemble unified campaign package", tool: "apostolic.campaign.finalizeDraft", input: {
        campaignId: { $from: "create_campaign.campaignId" }, pathway: { $from: "load_pathway" }, concept: { $from: "campaign_concept" }, copy: { $from: "campaign_copy" }, doctrine: { $from: "doctrine_check" }, links: { $from: "validate_links" }, social: { $from: "social_draft" }, email: { $from: "email_draft" }, youtube: { $from: "youtube_package" }, automation: { $from: "keyword_automation" }, carousel: { $from: "render_carousel" }
      }, dependsOn: ["render_carousel","social_draft","email_draft","youtube_package","keyword_automation","validate_links"], permission: "write", idempotency: { required: true, key: `${slug}:campaign-finalize:v1` } }),
      task({ id: "review", name: "Review campaign package", workflow: "runtime.review", input: { campaignId: { $from: "create_campaign.campaignId" } }, dependsOn: ["finalize_campaign"], permission: "write", approval: { required: true, type: "review" }, retryPolicy: { maxAttempts: 1, strategy: "fixed", baseDelayMs: 0, maxDelayMs: 0 }, timeoutMs: 60_000 }),
      task({ id: "completion_receipt", name: "Finalize approved run", tool: "runtime.composeText", input: { title: "CAMPAIGN PREPARATION COMPLETE", sections: [
        { label: "CAMPAIGN", content: { $from: "finalize_campaign" } },
        { label: "REVIEW", content: "Approved by human review. Nothing was published." }
      ] }, dependsOn: ["review"], permission: "execute" })
    ];
  }
};
