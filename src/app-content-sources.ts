import { allPathways } from "./pathway-catalog";
import { createServiceClient } from "./supabase";

type AppSource = {
  id: string;
  title: string;
  kind: string;
  entityType: "pathway";
  entityId: string;
  payload: Record<string, unknown>;
};

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 180);
}

export function pathwayAppPayload(pathway: (typeof allPathways)[number]) {
  return {
    id: pathway.slug,
    slug: pathway.slug,
    title: pathway.title,
    type: "doctrine" as const,
    description: pathway.summary,
    coreClaim: pathway.summary,
    categoryIds: [pathway.topicSlug].filter(Boolean),
    keywords: Array.from(new Set([
      pathway.title.toLowerCase(),
      pathway.topicSlug,
      ...pathway.steps.map((step) => step.reference.toLowerCase())
    ].filter(Boolean))),
    steps: pathway.steps.map((step, index) => ({
      id: `${pathway.slug}-step-${index + 1}`,
      order: index + 1,
      referenceId: slugify(step.reference),
      heading: step.title,
      explanation: step.explanation
    })),
    branches: [],
    objections: [],
    summary: pathway.summary,
    published: true,
    featured: false,
    collection: pathway.collection,
    estimatedMinutes: pathway.estimatedMinutes,
    level: pathway.level,
    websiteUrl: `/pathways/${pathway.slug}`,
    appSlug: pathway.appSlug
  };
}

/**
 * Keep App Content's pathway source choices pinned to the same TypeScript catalog
 * that renders the live 20 Pathways. This is an idempotent projection, not a
 * second manually maintained pathway library.
 */
export async function syncCanonicalPathwaySources(): Promise<AppSource[]> {
  const service = createServiceClient();
  if (!service) throw new Error("Supabase service access is not configured.");

  const itemRows = allPathways.map((pathway) => ({
    kind: "pathway",
    locale: "en-US",
    source_system: "pathway_catalog",
    source_key: `pathway:${pathway.slug}`,
    slug: pathway.slug,
    title: pathway.title,
    summary: pathway.summary,
    editorial_status: "approved",
    visibility: "private",
    featured: false,
    updated_at: new Date().toISOString()
  }));

  const upsert = await service.schema("content").from("items")
    .upsert(itemRows, { onConflict: "source_system,source_key" })
    .select("id,source_key,title,kind");
  if (upsert.error) throw new Error(`Canonical Pathway source sync failed: ${upsert.error.message}`);

  const byKey = new Map((upsert.data ?? []).map((row) => [String(row.source_key), row]));
  const documentRows = allPathways.flatMap((pathway) => {
    const row = byKey.get(`pathway:${pathway.slug}`);
    if (!row) return [];
    return [{
      content_item_id: row.id,
      body_json: { type: "app_source", version: 1, payload: pathwayAppPayload(pathway) },
      body_schema_version: 1,
      updated_at: new Date().toISOString()
    }];
  });
  if (documentRows.length) {
    const documents = await service.schema("content").from("documents")
      .upsert(documentRows, { onConflict: "content_item_id" });
    if (documents.error) throw new Error(`Canonical Pathway document sync failed: ${documents.error.message}`);
  }

  return allPathways.flatMap((pathway) => {
    const row = byKey.get(`pathway:${pathway.slug}`);
    if (!row) return [];
    return [{
      id: String(row.id),
      title: pathway.title,
      kind: "pathway",
      entityType: "pathway" as const,
      entityId: pathway.slug,
      payload: pathwayAppPayload(pathway)
    }];
  });
}
