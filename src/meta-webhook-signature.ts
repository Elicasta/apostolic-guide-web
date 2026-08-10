import { createHmac, timingSafeEqual } from "node:crypto";

function constantTimeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Meta documents webhook signatures as HMAC-SHA256 over an escaped-unicode
 * representation of the payload. Most requests verify against the raw body,
 * but Instagram can include non-ASCII text in comments/messages. We accept
 * either documented representation while still requiring the current app secret.
 */
export function verifyMetaWebhookSignature(rawBody: string, signature: string | null, appSecret: string) {
  if (!signature?.startsWith("sha256=") || !appSecret) return false;

  const candidates = new Set<string>([rawBody, escapeNonAscii(rawBody)]);
  for (const body of candidates) {
    const expected = `sha256=${createHmac("sha256", appSecret).update(body, "utf8").digest("hex")}`;
    if (constantTimeEqual(signature, expected)) return true;
  }
  return false;
}

export function escapeNonAscii(value: string) {
  let output = "";
  for (const char of value) {
    const codePoint = char.codePointAt(0)!;
    if (codePoint <= 0x7f) {
      output += char;
      continue;
    }
    if (codePoint <= 0xffff) {
      output += `\\u${codePoint.toString(16).padStart(4, "0")}`;
      continue;
    }
    const adjusted = codePoint - 0x10000;
    const high = 0xd800 + (adjusted >> 10);
    const low = 0xdc00 + (adjusted & 0x3ff);
    output += `\\u${high.toString(16).padStart(4, "0")}\\u${low.toString(16).padStart(4, "0")}`;
  }
  return output;
}
