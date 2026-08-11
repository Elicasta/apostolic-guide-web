"use server";

import { revalidatePath } from "next/cache";
import { getStudioPermission } from "@/auth";
import { hasStudioPermission } from "@/studio-permissions";
import { createServiceClient } from "@/supabase";

async function requireManageContent() {
  const permission = await getStudioPermission("manage_content");
  const allowed = permission.access.state === "unconfigured" || hasStudioPermission(permission.access.role, "manage_content");
  if (!allowed) throw new Error("You do not have permission to manage pathway publishing.");
  const service = createServiceClient();
  if (!service) throw new Error("Supabase service access is not configured.");
  return service;
}

function text(data: FormData, key: string) {
  const value = String(data.get(key) ?? "").trim();
  return value || null;
}

function required(data: FormData, key: string) {
  const value = text(data, key);
  if (!value) throw new Error(`${key} is required.`);
  return value;
}

function revalidate(slug: string) {
  revalidatePath("/admin/pathways");
  revalidatePath(`/admin/pathways/${slug}`);
}

export async function savePathwayProfile(formData: FormData) {
  const service = await requireManageContent();
  const slug = required(formData, "pathway_slug");
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
  const payload = {
    pathway_slug: slug,
    type: required(formData, "type"),
    title: required(formData, "title"),
    language: text(formData, "language") || "en",
    status: required(formData, "status"),
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
    published_at: required(formData, "status") === "published" ? new Date().toISOString() : null
  };
  const { error } = await service.from("pathway_assets").insert(payload);
  if (error) throw new Error(error.message);
  revalidate(slug);
}

export async function updatePathwayAsset(formData: FormData) {
  const service = await requireManageContent();
  const id = required(formData, "id");
  const slug = required(formData, "pathway_slug");
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
  const { error } = await service.from("pathway_assets").update(payload).eq("id", id);
  if (error) throw new Error(error.message);
  revalidate(slug);
}

export async function archivePathwayAsset(formData: FormData) {
  const service = await requireManageContent();
  const id = required(formData, "id");
  const slug = required(formData, "pathway_slug");
  const { error } = await service.from("pathway_assets").update({ status: "archived" }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidate(slug);
}
