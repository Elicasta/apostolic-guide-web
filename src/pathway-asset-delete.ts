export type PathwayAssetDeleteNode = {
  id: string;
  parent_asset_id: string | null;
};

export function collectPathwayAssetDeleteIds(rootId: string, nodes: PathwayAssetDeleteNode[]) {
  const children = new Map<string, string[]>();
  for (const node of nodes) {
    if (!node.parent_asset_id) continue;
    const current = children.get(node.parent_asset_id) ?? [];
    current.push(node.id);
    children.set(node.parent_asset_id, current);
  }

  const ordered: string[] = [];
  const seen = new Set<string>();
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ordered.push(id);
    for (const childId of children.get(id) ?? []) stack.push(childId);
  }
  return ordered;
}

export function assetMetadataString(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
