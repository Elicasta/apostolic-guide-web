import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { z } from "zod";
import type { SolTool } from "../types";

const MAX_RESPONSE_BYTES = 1_000_000;
const MAX_REDIRECTS = 3;

const inputSchema = z.object({
  url: z.string().url(),
  method: z.enum(["GET", "HEAD"]).default("GET"),
  headers: z.record(z.string(), z.string().max(4000)).default({})
});

const outputSchema = z.object({
  url: z.string(),
  status: z.number().int(),
  ok: z.boolean(),
  contentType: z.string().nullable(),
  headers: z.record(z.string(), z.string()),
  body: z.string(),
  json: z.unknown().optional()
});

function isPrivateIpv4(address: string) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

function isPrivateIpv6(address: string) {
  const lower = address.toLowerCase();
  return lower === "::" || lower === "::1" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb") || lower.startsWith("ff");
}

function isPrivateAddress(address: string) {
  const version = isIP(address);
  if (version === 4) return isPrivateIpv4(address);
  if (version === 6) {
    const mapped = address.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
    return mapped ? isPrivateIpv4(mapped) : isPrivateIpv6(address);
  }
  return true;
}

export async function assertSolPublicHttps(rawUrl: string) {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:") throw new Error("SOL internet tools only permit HTTPS URLs.");
  if (url.username || url.password) throw new Error("Credentials in request URLs are not permitted.");
  const hostname = url.hostname.toLowerCase();
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal")) throw new Error("Private or local hostnames are not permitted.");
  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) throw new Error("Private IP addresses are not permitted.");
    return url;
  }
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((item) => isPrivateAddress(item.address))) throw new Error("Target hostname resolves to a private or invalid address.");
  return url;
}

async function readBoundedBody(response: Response, signal: AbortSignal) {
  if (!response.body) return "";
  const length = Number(response.headers.get("content-length") || 0);
  if (length > MAX_RESPONSE_BYTES) throw new Error(`HTTP response exceeds ${MAX_RESPONSE_BYTES} bytes.`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let body = "";
  try {
    while (true) {
      if (signal.aborted) throw new DOMException("Request aborted", "AbortError");
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) throw new Error(`HTTP response exceeds ${MAX_RESPONSE_BYTES} bytes.`);
      body += decoder.decode(chunk.value, { stream: true });
    }
    body += decoder.decode();
    return body;
  } finally {
    reader.releaseLock();
  }
}

function responseHeaders(response: Response) {
  const headers: Record<string, string> = {};
  for (const [key, value] of response.headers.entries()) {
    if (["set-cookie", "www-authenticate", "proxy-authenticate"].includes(key.toLowerCase())) continue;
    headers[key] = value.slice(0, 8000);
  }
  return headers;
}

export const solHttpRequestTool: SolTool<z.infer<typeof inputSchema>, z.infer<typeof outputSchema>> = {
  name: "http.request",
  description: "Perform a bounded read-only HTTPS request to a public internet host.",
  inputSchema,
  outputSchema,
  permissions: ["read"],
  supportedEnvironments: ["local", "development", "preview", "production"],
  idempotency: "not_required",
  async execute(input, context) {
    try {
      let url = await assertSolPublicHttps(input.url);
      let response: Response | null = null;
      for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
        response = await fetch(url, { method: input.method, headers: input.headers, redirect: "manual", cache: "no-store", signal: context.signal });
        if (![301, 302, 303, 307, 308].includes(response.status)) break;
        const location = response.headers.get("location");
        if (!location) break;
        if (redirect === MAX_REDIRECTS) return { ok: false, error: { code: "REDIRECT_LIMIT", message: "HTTP redirect limit exceeded.", retryable: false } };
        url = await assertSolPublicHttps(new URL(location, url).toString());
      }
      if (!response) return { ok: false, error: { code: "NETWORK", message: "HTTP request produced no response.", retryable: true } };
      const contentType = response.headers.get("content-type");
      const body = input.method === "HEAD" ? "" : await readBoundedBody(response, context.signal);
      let json: unknown;
      if (body && contentType?.toLowerCase().includes("application/json")) { try { json = JSON.parse(body); } catch {} }
      return { ok: true, data: { url: url.toString(), status: response.status, ok: response.ok, contentType, headers: responseHeaders(response), body, ...(json === undefined ? {} : { json }) }, observations: { responseBytes: new TextEncoder().encode(body).byteLength, redirectsFollowed: url.toString() === input.url ? 0 : undefined } };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return { ok: false, error: { code: "TIMEOUT", message: "HTTP request was aborted or timed out.", retryable: true } };
      const message = error instanceof Error ? error.message : "HTTP request failed.";
      const retryable = /fetch failed|network|econnreset|enotfound|eai_again/i.test(message);
      return { ok: false, error: { code: retryable ? "NETWORK" : "INVALID_INPUT", message, retryable } };
    }
  }
};
