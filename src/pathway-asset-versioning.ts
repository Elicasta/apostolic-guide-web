export const PATHWAY_ASSET_RESTORABLE_FIELDS = [
  "parent_asset_id",
  "asset_type",
  "title",
  "status",
  "source_type",
  "editable",
  "content",
  "storage_bucket",
  "storage_path",
  "public_url",
  "prompt",
  "model",
  "metadata"
] as const;

export function buildPathwayAssetRestorePatch({
  snapshot,
  currentVersion,
  userId,
  updatedAt
}: {
  snapshot: Record<string, unknown>;
  currentVersion: number;
  userId: string;
  updatedAt: string;
}) {
  const restored: Record<string, unknown> = {};
  for (const field of PATHWAY_ASSET_RESTORABLE_FIELDS) {
    if (field in snapshot) restored[field] = snapshot[field];
  }
  restored.version = currentVersion + 1;
  restored.updated_by = userId;
  restored.updated_at = updatedAt;
  return restored;
}
