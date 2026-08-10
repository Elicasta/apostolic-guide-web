export type SegmentMatchMode = "all" | "any";

export type CustomSegmentRule = {
  segment_key: string;
  negate: boolean;
};

export function evaluateSegmentRuleSet(
  personId: string,
  memberIds: Map<string, Set<string>>,
  matchMode: SegmentMatchMode,
  rules: CustomSegmentRule[]
) {
  if (!rules.length) return false;
  const results = rules.map((rule) => {
    const member = memberIds.get(rule.segment_key)?.has(personId) ?? false;
    return rule.negate ? !member : member;
  });
  return matchMode === "any" ? results.some(Boolean) : results.every(Boolean);
}
