"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getStudioPermission } from "@/auth";
import { hasStudioPermission } from "@/studio-permissions";
import { allPathways } from "@/pathway-catalog";
import { syncPublicationMetrics } from "@/publication-metrics";
import { createServiceClient } from "@/supabase";

async function requireManageContent() {
  const permission = await getStudioPermission("manage_content");
  const allowed = permission.access.state === "unconfigured" || hasStudioPermission(permission.access.role, "manage_content");
  if (!allowed) throw new Error("You do not have permission to manage pathway publishing.");
  const service = createServiceClient();
  if (!service) throw new Error("Supabase service access is not configured.");
  return service;
}

type ServiceClient = NonNullable<ReturnType<typeof createServiceClient>>;

function text(data: FormData, key: string) {
  const value = String(data.get(key) ?? "").trim();
  return value || null;
}

function required(data: FormData, key: string) {
  const value = text(data, key);
  if (!value) throw new Error(`${key} is required.`);
  return value;
}

function requireCanonicalPathway(slug: string) {
  const pathway = allPathways.find((item) => item.slug === slug);
  if (!pathway) throw new Error("Choose an existing Apostolic Guide Pathway.");
  return pathway;
}

async function ensureProject(service: ServiceClient, slug: string) {
  const { error } = await service.from("pathway_publishing_profiles").upsert(
    { pathway_slug: slug },
    { onConflict: "pathway_slug", ignoreDuplicates: true }
  );
  if (error) throw new Error(error.message);
}

function revalidate(slug: string) {
  revalidatePath("/admin/pathways");
  revalidatePath(`/admin/pathways/${slug}`);
}

export async function createPathwayProject(formData: FormData) {
  const service = await requireManageContent();
  const slug = required(formData, "pathway_slug");
  requireCanonicalPathway(slug);
  await ensureProject(service, slug);
  revalidate(slug);
  redirect(`/admin/pathways/${slug}`);
}

export async function savePathwayProfile(formData: FormData) {
  const service = await requireManageContent();
  const slug = required(formData, "pathway_slug");
  requireCanonicalPathway(slug);
  const payload = {
    pathway_slug: slug,
    primary_keyword: text(formData, "primary_keyword"),
    campaign_status: required(formData, "campaign_status"),
    app_url: text(formData, "app_url"),
    social_automation_id: text(formData, "social_automation_id"),
    notes: text(formData, "notes")
  };
  const { error } = await service.from("pathway_publishing_profiles").upsert(payload, { onConflict: "pathway_slug" });
  if (error) throw new Error(error.message);
  revalidate(slug);
}

export async function createPathwayAsset(formData: FormData) {
  const service = await requireManageContent();
  const slug = required(formData, "pathway_slug");
  requireCanonicalPathway(slug);
  await ensureProject(service, slug);
  const status = required(formData, "status");
  const payload = {
    pathway_slug: slug,
    type: required(formData, "type"),
    title: required(formData, "title"),
    language: text(formData, "language") || "en",
    status,
    platform: text(formData, "platform"),
    source_url: text(formData, "source_url"),
    file_url: text(formData, "file_url"),
    published_url: text(formData, "published_url"),
    hook: text(formData, "hook"),
    caption: text(formData, "caption"),
    cta_type: required(formData, "cta_type"),
    cta_keyword: text(formData, "cta_keyword"),
    destination_url: text(formData, "destination_url"),
    notes: text(formData, "asset_notes"),
    sort_order: Number(formData.get("sort_order") || 0),
    published_at: status === "published" ? new Date().toISOString() : null
  };
  const { error } = await service.from("pathway_assets").insert(payload);
  if (error) throw new Error(error.message);
  revalidate(slug);
}

export async function updatePathwayAsset(formData: FormData) {
  const service = await requireManageContent();
  const id = required(formData, "id");
  const slug = required(formData, "pathway_slug");
  requireCanonicalPathway(slug);
  const status = required(formData, "status");
  const payload = {
    type: required(formData, "type"),
    title: required(formData, "title"),
    language: text(formData, "language") || "en",
    status,
    platform: text(formData, "platform"),
    source_url: text(formData, "source_url"),
    file_url: text(formData, "file_url"),
    published_url: text(formData, "published_url"),
    hook: text(formData, "hook"),
    caption: text(formData, "caption"),
    cta_type: required(formData, "cta_type"),
    cta_keyword: text(formData, "cta_keyword"),
    destination_url: text(formData, "destination_url"),
    notes: text(formData, "asset_notes"),
    sort_order: Number(formData.get("sort_order") || 0),
    published_at: status === "published" ? text(formData, "published_at") || new Date().toISOString() : null
  };
  const { error } = await service.from("pathway_assets").update(payload).eq("id", id).eq("pathway_slug", slug);
  if (error) throw new Error(error.message);
  revalidate(slug);
}

export async function archivePathwayAsset(formData: FormData) {
  const service = await requireManageContent();
  const id = required(formData, "id");
  const slug = required(formData, "pathway_slug");
  requireCanonicalPathway(slug);
  const { error } = await service.from("pathway_assets").update({ status: "archived" }).eq("id", id).eq("pathway_slug", slug);
  if (error) throw new Error(error.message);
  revalidate(slug);
}

export async function createPathwayPublication(formData: FormData) {
  const service = await requireManageContent();
  const slug = required(formData, "pathway_slug");
  requireCanonicalPathway(slug);
  await ensureProject(service, slug);
  const platform = required(formData, "platform").toLowerCase();
  const assetId = text(formData, "asset_id");
  const externalPostId = required(formData, "external_post_id");
  const publishedUrl = text(formData, "published_url");
  const publishedAt = text(formData, "published_at") || new Date().toISOString();
  const { data, error } = await service.from("pathway_publications").insert({
    pathway_slug: slug,
    asset_id: assetId,
    platform,
    status: "published",
    external_post_id: externalPostId,
    published_url: publishedUrl,
    published_at: publishedAt,
    metadata: {}
  }).select("id").single();
  if (error) throw new Error(error.message);

  if (assetId) {
    const { error: assetError } = await service.from("pathway_assets").update({ status: "published", published_at: publishedAt }).eq("id", assetId).eq("pathway_slug", slug);
    if (assetError) throw new Error(assetError.message);
  }

  if (data?.id) {
    try { await syncPublicationMetrics(String(data.id)); } catch (error) { console.error("Initial metric sync failed", error); }
  }
  revalidate(slug);
}

export async function syncPathwayPublicationMetrics(formData: FormData) {
  await requireManageContent();
  const slug = required(formData, "pathway_slug");
  requireCanonicalPathway(slug);
  const publicationId = required(formData, "publication_id");
  await syncPublicationMetrics(publicationId);
  revalidate(slug);
}

export async function deletePathwayPublication(formData: FormData) {
  const service = await requireManageContent();
  const slug = required(formData, "pathway_slug");
  requireCanonicalPathway(slug);
  const publicationId = required(formData, "publication_id");
  const { error } = await service.from("pathway_publications").delete().eq("id", publicationId).eq("pathway_slug", slug);
  if (error) throw new Error(error.message);
  revalidate(slug);
}
