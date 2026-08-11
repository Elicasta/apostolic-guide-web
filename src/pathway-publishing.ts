import { createServiceClient } from "./supabase";
import { allPathways } from "./pathway-catalog";
import { listSocialAutomations } from "./social-messaging";

export type PathwayPublishingProfile = {
  pathway_slug: string;
  primary_keyword: string | null;
  campaign_status: "planning" | "active" | "paused" | "complete" | "archived";
  app_url: string | null;
  social_automation_id: string | null;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
};

export type PathwayAsset = {
  id: string;
  pathway_slug: string;
  type: "youtube" | "short_video" | "carousel" | "graphic" | "story" | "pdf" | "email" | "article" | "thumbnail" | "script" | "print" | "merch" | "other";
  title: string;
  language: string;
  status: "idea" | "script" | "ready_to_produce" | "in_production" | "ready_to_publish" | "published" | "blocked" | "archived";
  platform: string | null;
  source_url: string | null;
  file_url: string | null;
  published_url: string | null;
  hook: string | null;
  caption: string | null;
  cta_type: "none" | "comment_keyword" | "visit_pathway" | "download_pdf" | "watch_youtube" | "open_app";
  cta_keyword: string | null;
  destination_url: string | null;
  notes: string | null;
  sort_order: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

type PublishingPathway = (typeof allPathways)[number] & { keySteps: number };

export type PathwayPublishingSummary = {
  pathway: PublishingPathway;
  profile: PathwayPublishingProfile | null;
  assets: PathwayAsset[];
  publishedAssets: number;
  completion: number;
  started: boolean;
  socialAutomationName: string | null;
  websiteUrl: string;
  appUrl: string;
};

function defaultAppUrl(appSlug: string, websiteSlug: string) {
  return `https://app.apostolicguide.com/paths/${appSlug}?source=website&origin=website-pathway-${websiteSlug}`;
}

export function websitePathwayUrl(slug: string) {
  return `https://www.apostolicguide.com/pathways/${slug}`;
}

export function listPublishingPathways(): PublishingPathway[] {
  return allPathways.map((pathway) => ({ ...pathway, keySteps: pathway.steps.length }));
}

export async function listPathwayPublishingSummaries(): Promise<PathwayPublishingSummary[]> {
  const service = createServiceClient();
  let profiles: PathwayPublishingProfile[] = [];
  let assets: PathwayAsset[] = [];
  if (service) {
    const [profileResult, assetResult] = await Promise.all([
      service.from("pathway_publishing_profiles").select("*"),
      service.from("pathway_assets").select("*").neq("status", "archived").order("sort_order", { ascending: true }).order("created_at", { ascending: true })
    ]);
    if (!profileResult.error) profiles = (profileResult.data ?? []) as PathwayPublishingProfile[];
    if (!assetResult.error) assets = (assetResult.data ?? []) as PathwayAsset[];
  }

  const automations = await listSocialAutomations();
  const profileMap = new Map(profiles.map((profile) => [profile.pathway_slug, profile]));
  const automationMap = new Map(automations.map((automation) => [automation.id, automation.name]));

  return listPublishingPathways().map((pathway) => {
    const profile = profileMap.get(pathway.slug) ?? null;
    const pathwayAssets = assets.filter((asset) => asset.pathway_slug === pathway.slug);
    const publishedAssets = pathwayAssets.filter((asset) => asset.status === "published").length;
    const completion = pathwayAssets.length ? Math.round((publishedAssets / pathwayAssets.length) * 100) : 0;
    return {
      pathway,
      profile,
      assets: pathwayAssets,
      publishedAssets,
      completion,
      started: Boolean(profile || pathwayAssets.length),
      socialAutomationName: profile?.social_automation_id ? automationMap.get(profile.social_automation_id) ?? null : null,
      websiteUrl: websitePathwayUrl(pathway.slug),
      appUrl: profile?.app_url || defaultAppUrl(pathway.appSlug, pathway.slug)
    };
  });
}

export async function getPathwayPublishingSummary(slug: string) {
  const summaries = await listPathwayPublishingSummaries();
  return summaries.find((summary) => summary.pathway.slug === slug) ?? null;
}

export async function listAvailableSocialAutomations() {
  return listSocialAutomations();
}
