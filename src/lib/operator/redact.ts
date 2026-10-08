const SECRET_KEY = /api[_-]?key|token|secret|password|authorization|cookie|credential/i;
const SECRET_VALUE = /\b(sk-|sbp_|eyJ|xox[baprs]-)[A-Za-z0-9._-]{6,}\b/g;

export function redactOperatorText(value: string, limit = 500) {
  return value.replace(SECRET_VALUE, "[redacted]").replace(/\s+/g, " ").trim().slice(0, limit);
}

export function redactOperatorData(value: unknown, depth = 0): unknown {
  if (depth > 6) return null;
  if (typeof value === "string") return redactOperatorText(value, 500);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 40).map((item) => redactOperatorData(item, depth + 1));
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 40)) {
      if (SECRET_KEY.test(key)) continue;
      output[key] = redactOperatorData(item, depth + 1);
    }
    return output;
  }
  return null;
}

export function boundedResult(data: Record<string, unknown>) {
  const redacted = redactOperatorData(data);
  const json = JSON.stringify(redacted ?? {});
  if (json.length <= 24_000 && redacted && typeof redacted === "object" && !Array.isArray(redacted)) {
    return redacted as Record<string, unknown>;
  }
  return {
    truncated: true,
    planId: typeof data.planId === "string" ? data.planId : null,
    assetId: typeof data.assetId === "string" ? data.assetId : null,
    scratchId: typeof data.scratchId === "string" ? data.scratchId : null
  };
}
