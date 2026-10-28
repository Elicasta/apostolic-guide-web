import "server-only";
import { assertEditorialSourceCurrent } from "./editorial-engine";
import { executeScheduledPublication } from "./scheduled-publishing";
import { instagramGraphBase } from "./instagram-api";
import { publishReadyInstagramContainer, waitForInstagramContainer } from "./instagram-container-publishing";
import { privateBlobReadUrl } from "./private-blob";
import { getSocialPublishingCredentialValues } from "./social-publishing-integrations";
import { createServiceClient } from "./supabase";
import { loadCreativeProject } from "./creative-project-server";
import { assertDoctrineApproved, creativeDoctrineSource } from "./doctrine-gate";

type GraphResponse = { id?: string; status_code?: string; permalink?: string; error?: { message?: string } };
type CreativeMedia = {
  frameId?: string;
  sortOrder?: number;
  assetId?: string;
  url?: string;
  storageBucket?: string;
  storagePath?: string;
  blobAccess?: unknown;
};
type CreativeMetadata = {
  source_kind?: string;
  creative_project_id?: string;
  project_state_version?: number;
  format?: "single" | "carousel" | "story";
  caption?: string;
  media_urls?: string[];
  media?: CreativeMedia[];
  container_ids?: string[];
  published_media_ids?: string[];
  publish_attempted_at?: string;
  publish_container_id?: string;
};

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function graphJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({})) as GraphResponse;
  if (!response.ok || data.error) throw new Error(data.error?.message || `Instagram API request failed (${response.status}).`);
  return data;
}

async function permalinkFor(base: string, mediaId: string, accessToken: string) {
  try {
    const params = new URLSearchParams({ fields: "permalink", access_token: accessToken });
    const result = await graphJson(`${base}/${encodeURIComponent(mediaId)}?${params.toString()}`);
    return result.permalink || null;
  } catch {
    return null;
  }
}

async function mediaUrlsForPublication(metadata: CreativeMetadata) {
  const media = Array.isArray(metadata.media) ? metadata.media : [];
  if (media.length) {
    const resolved = await Promise.all(media.map(async (item) => {
      if (item.storageBucket === "vercel_blob" && item.storagePath && item.blobAccess === "private") {
        return privateBlobReadUrl(item.storagePath, 45 * 60 * 1000);
      }
      return typeof item.url === "string" && /^https:\/\//.test(item.url) ? item.url : null;
    }));
    const valid = resolved.filter((value): value is string => typeof value === "string" && /^https:\/\//.test(value));
    if (valid.length !== media.length) throw new Error("One or more scheduled images could not be resolved; publication aborted.");
    return valid;
  }
  return Array.isArray(metadata.media_urls)
    ? metadata.media_urls.filter((value): value is string => typeof value === "string" && /^https:\/\//.test(value))
    : [];
}

type PublishHooks = {
  onContainerCreated: (containerId: string) => Promise<void>;
  beforePublish: (containerId: string) => Promise<void>;
  afterPublish: (mediaId: string) => Promise<void>;
};

async function publishCreativeInstagram(metadata: CreativeMetadata, hooks: PublishHooks) {
  const credentials = await getSocialPublishingCredentialValues("instagram") as Record<string, string>;
  if (!credentials.accessToken || !credentials.instagramUserId) throw new Error("Instagram publishing credentials are missing. Open Setup and reconnect Instagram.");
  const mediaUrls = await mediaUrlsForPublication(metadata);
  if (!mediaUrls.length) throw new Error("The Creative Project publication has no rendered media URLs.");
  const format = metadata.format;
  if (!format || !["single", "carousel", "story"].includes(format)) throw new Error("The Creative Project publication is missing its format.");
  if (format === "single" && mediaUrls.length !== 1) throw new Error("A Single Post must contain exactly one rendered image.");
  if (format === "carousel" && mediaUrls.length < 2) throw new Error("A Carousel must contain at least two rendered images.");

  const base = instagramGraphBase(credentials.graphVersion);
  const caption = String(metadata.caption || "").slice(0, 2200);
  const common = { base, userId: credentials.instagramUserId, accessToken: credentials.accessToken, deadlineAt: Date.now() + 235_000, beforePublish: hooks.beforePublish, afterPublish: hooks.afterPublish };

  if (format === "single") {
    const createParams = new URLSearchParams({ image_url: mediaUrls[0], caption, access_token: credentials.accessToken });
    const container = await graphJson(`${base}/${encodeURIComponent(credentials.instagramUserId)}/media?${createParams.toString()}`, { method: "POST" });
    if (!container.id) throw new Error("Instagram did not return a Single Post container ID.");
    await hooks.onContainerCreated(container.id);
    const mediaId = await publishReadyInstagramContainer({ ...common, containerId: container.id });
    return { ids: [mediaId], publishedUrl: await permalinkFor(base, mediaId, credentials.accessToken), containerIds: [container.id] };
  }

  if (format === "carousel") {
    const childIds: string[] = [];
    for (const imageUrl of mediaUrls) {
      const params = new URLSearchParams({ image_url: imageUrl, is_carousel_item: "true", access_token: credentials.accessToken });
      const child = await graphJson(`${base}/${encodeURIComponent(credentials.instagramUserId)}/media?${params.toString()}`, { method: "POST" });
      if (!child.id) throw new Error("Instagram did not return a Carousel child container ID.");
      await hooks.onContainerCreated(child.id);
      await waitForInstagramContainer({ ...common, containerId: child.id });
      childIds.push(child.id);
    }
    const parentParams = new URLSearchParams({ media_type: "CAROUSEL", children: childIds.join(","), caption, access_token: credentials.accessToken });
    const parent = await graphJson(`${base}/${encodeURIComponent(credentials.instagramUserId)}/media?${parentParams.toString()}`, { method: "POST" });
    if (!parent.id) throw new Error("Instagram did not return a Carousel container ID.");
    await hooks.onContainerCreated(parent.id);
    const mediaId = await publishReadyInstagramContainer({ ...common, containerId: parent.id });
    return { ids: [mediaId], publishedUrl: await permalinkFor(base, mediaId, credentials.accessToken), containerIds: [...childIds, parent.id] };
  }

  const storyIds: string[] = [];
  const containerIds: string[] = [];
  for (const imageUrl of mediaUrls) {
    const params = new URLSearchParams({ media_type: "STORIES", image_url: imageUrl, access_token: credentials.accessToken });
    const container = await graphJson(`${base}/${encodeURIComponent(credentials.instagramUserId)}/media?${params.toString()}`, { method: "POST" });
    if (!container.id) throw new Error("Instagram did not return a Story container ID.");
    await hooks.onContainerCreated(container.id);
    storyIds.push(await publishReadyInstagramContainer({ ...common, containerId: container.id }));
    containerIds.push(container.id);
  }
  return { ids: storyIds, publishedUrl: null, containerIds };
}

async function executeCreativePublication(publicationId: string) {
  const service = createServiceClient();
  if (!service) throw new Error("Supabase service access is not configured.");
  const current = await service.from("pathway_publications")
    .select("id,pathway_slug,platform,status,metadata,creative_project_id,attempt_count")
    .eq("id", publicationId)
    .maybeSingle();
  if (current.error) throw new Error(current.error.message);
  if (!current.data || current.data.status !== "scheduled" || !current.data.creative_project_id) return { skipped: true };

  const claimed = await service.from("pathway_publications").update({
    status: "publishing",
    error_message: null,
    attempt_count: Number(current.data.attempt_count || 0) + 1,
    updated_at: new Date().toISOString()
  }).eq("id", publicationId).eq("status", "scheduled").select("id,pathway_slug,platform,metadata,creative_project_id,attempt_count").maybeSingle();
  if (claimed.error) throw new Error(claimed.error.message);
  if (!claimed.data) return { skipped: true };

  const metadata = record(claimed.data.metadata) as CreativeMetadata;
  let progress: CreativeMetadata = { ...metadata };
  async function saveProgress(delta: Partial<CreativeMetadata>) {
    const next = { ...progress, ...delta };
    const saved = await service.from("pathway_publications").update({
      metadata: next, updated_at: new Date().toISOString()
    }).eq("id", publicationId).eq("status", "publishing").select("id").maybeSingle();
    if (saved.error || !saved.data) throw new Error("Unable to checkpoint Instagram publishing safely; no further publishing will be attempted.");
    progress = next;
  }
  try {
    const project = await service.from("studio_creative_projects")
      .select("id,state_version,status,pathway_slug,editor_state")
      .eq("id", claimed.data.creative_project_id)
      .maybeSingle();
    if (project.error) throw new Error(project.error.message);
    if (!project.data) throw new Error("The Creative Project no longer exists.");
    if (Number(metadata.project_state_version || 0) !== Number(project.data.state_version || 0)) {
      throw new Error("The Creative Project changed after it was scheduled. Review the current version and schedule it again.");
    }
    assertEditorialSourceCurrent({ pathwaySlug: project.data.pathway_slug, editorState: record(project.data.editor_state) });
    const latestProject=await loadCreativeProject(service,project.data.id);
    if(!latestProject)throw new Error("Creative project is unavailable.");
    await assertDoctrineApproved(service,creativeDoctrineSource(latestProject,String(metadata.caption||"")));
    if (claimed.data.platform !== "instagram") throw new Error(`Creative Project auto publishing is not implemented for ${claimed.data.platform}. Use Finish Manually instead.`);
    if (metadata.publish_attempted_at || metadata.published_media_ids?.length) {
      throw new Error("Instagram publishing has already been attempted for this item. Verify the Instagram feed before a new attempt to prevent duplicate posts.");
    }
    const result = await publishCreativeInstagram(metadata, {
      onContainerCreated: (containerId) => saveProgress({ container_ids: [...(progress.container_ids || []), containerId] }),
      beforePublish: (containerId) => saveProgress({ publish_attempted_at: new Date().toISOString(), publish_container_id: containerId }),
      afterPublish: (mediaId) => saveProgress({ published_media_ids: [...(progress.published_media_ids || []), mediaId] })
    });
    const now = new Date().toISOString();
    const [publicationUpdate, projectUpdate] = await Promise.all([
      service.from("pathway_publications").update({
        status: "published",
        external_post_id: result.ids.join(","),
        published_url: result.publishedUrl,
        published_at: now,
        error_message: null,
        metadata: { ...progress, published_media_ids: result.ids, container_ids: result.containerIds },
        updated_at: now
      }).eq("id", publicationId),
      service.from("studio_creative_projects").update({ status: "published", published_at: now, updated_at: now }).eq("id", claimed.data.creative_project_id)
    ]);
    const error = publicationUpdate.error || projectUpdate.error;
    if (error) throw new Error(error.message);
    return { publishedUrl: result.publishedUrl, publishedIds: result.ids };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Creative Project publishing failed.";
    await Promise.all([
      service.from("pathway_publications").update({ status: "failed", error_message: message.slice(0, 1800), updated_at: new Date().toISOString() }).eq("id", publicationId),
      service.from("studio_creative_projects").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", claimed.data.creative_project_id)
    ]);
    throw error;
  }
}

export async function executePublication(publicationId: string) {
  const service = createServiceClient();
  if (!service) throw new Error("Supabase service access is not configured.");
  const publication = await service.from("pathway_publications").select("id,creative_project_id").eq("id", publicationId).maybeSingle();
  if (publication.error) throw new Error(publication.error.message);
  if (!publication.data) return { skipped: true };
  if (publication.data.creative_project_id) return executeCreativePublication(publicationId);
  return executeScheduledPublication(publicationId);
}
