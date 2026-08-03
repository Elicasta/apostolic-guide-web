import { getAdminAccess } from "./auth";
import { createServiceClient, createSupabaseServerClient } from "./supabase";

export type DatabaseContentItem = {
  id: string;
  kind: string;
  slug: string;
  title: string;
  summary: string;
  body: unknown;
  sourceSystem?: string;
  editorialStatus?: string;
  websiteStatus?: string;
  publishedAt?: string;
  updatedAt?: string;
};

function mapItem(row: any): DatabaseContentItem {
  const publications = Array.isArray(row.publications) ? row.publications : row.publications ? [row.publications] : [];
  const websitePublication = publications.find((publication: any) => publication.channel === "website");
  return {
    id: row.id,
    kind: row.kind,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    body: row.documents?.body_json ?? null,
    sourceSystem: row.source_system,
    editorialStatus: row.editorial_status,
    websiteStatus: websitePublication?.status,
    publishedAt: websitePublication?.published_at ?? undefined,
    updatedAt: row.updated_at
  };
}

export async function listDatabaseContent(kind?: string): Promise<DatabaseContentItem[]> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [];
  try {
    let query = supabase.schema("content").from("items")
      .select("id,kind,slug,title,summary,source_system,editorial_status,updated_at,documents(body_json),publications!inner(channel,status,published_at)")
      .eq("publications.channel", "website")
      .eq("publications.status", "published")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });
    if (kind) query = query.eq("kind", kind);
    const { data, error } = await query;
    if (error || !data) return [];
    return data.map(mapItem);
  } catch {
    return [];
  }
}

export async function listAdminContent(): Promise<DatabaseContentItem[]> {
  const access = await getAdminAccess();
  if (access.state !== "allowed") return [];
  const supabase = createServiceClient();
  if (!supabase) return [];
  try {
    const { data, error } = await supabase.schema("content").from("items")
      .select("id,kind,slug,title,summary,source_system,editorial_status,updated_at,documents(body_json),publications(channel,status,published_at)")
      .eq("source_system", "website")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });
    if (error || !data) return [];
    return data.map(mapItem);
  } catch {
    return [];
  }
}

export async function getDatabaseContent(kind: string, slug: string) {
  const items = await listDatabaseContent(kind);
  return items.find((item) => item.slug === slug) ?? null;
}

export async function getAdminContent(id: string) {
  const items = await listAdminContent();
  return items.find((item) => item.id === id) ?? null;
}

export function documentToPlainText(body: unknown) {
  if (!body || typeof body !== "object" || !("blocks" in body)) return "";
  const blocks = (body as { blocks?: unknown }).blocks;
  if (!Array.isArray(blocks)) return "";
  return blocks
    .map((block) => {
      if (!block || typeof block !== "object" || !("data" in block)) return "";
      const data = (block as { data?: unknown }).data;
      if (!data || typeof data !== "object" || !("text" in data)) return "";
      const text = (data as { text?: unknown }).text;
      return typeof text === "string" ? text : "";
    })
    .filter(Boolean)
    .join("\n\n");
}
