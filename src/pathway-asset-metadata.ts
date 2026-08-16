export type PathwayAssetMetadata = Record<string, unknown>;

export function normalizeAssetTags(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const tag = item.trim().replace(/\s+/g, " ").slice(0, 40);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length >= 24) break;
  }
  return tags;
}

export function assetTags(metadata: PathwayAssetMetadata | null | undefined) {
  return normalizeAssetTags(metadata?.tags);
}

export function assetDescription(metadata: PathwayAssetMetadata | null | undefined) {
  return typeof metadata?.description === "string" ? metadata.description.trim() : "";
}

export function assetAltText(metadata: PathwayAssetMetadata | null | undefined) {
  return typeof metadata?.altText === "string" ? metadata.altText.trim() : "";
}

export function assetIsFavorite(metadata: PathwayAssetMetadata | null | undefined) {
  return metadata?.favorite === true;
}

export function assetSearchText(asset: {
  title: string;
  asset_type: string;
  source_type: string;
  status: string;
  metadata?: PathwayAssetMetadata | null;
}) {
  return [
    asset.title,
    asset.asset_type.replaceAll("-", " "),
    asset.source_type,
    asset.status,
    assetDescription(asset.metadata),
    assetAltText(asset.metadata),
    ...assetTags(asset.metadata)
  ].join(" ").toLowerCase();
}

export function assetMatchesQuery(asset: Parameters<typeof assetSearchText>[0], query: string) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const haystack = assetSearchText(asset);
  return terms.every((term) => haystack.includes(term));
}

export function parseAssetTagInput(value: string) {
  return normalizeAssetTags(value.split(","));
}
