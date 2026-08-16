import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { assertSolPublicHttps } from "../http/request";
import type { SolTool } from "../types";

const MAX_HTML = 1_500_000;
const MAX_SCREENSHOT_BYTES = 12_000_000;

async function fetchHtml(rawUrl: string, signal: AbortSignal) {
  const url = await assertSolPublicHttps(rawUrl);
  const response = await fetch(url, { method: "GET", redirect: "follow", cache: "no-store", signal, headers: { "user-agent": "SOL-Runtime/1.0" } });
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("text/html")) throw new Error(`Expected HTML but received ${contentType || "unknown content type"}.`);
  const text = await response.text();
  if (Buffer.byteLength(text) > MAX_HTML) throw new Error(`HTML response exceeds ${MAX_HTML} bytes.`);
  return { url: response.url || url.toString(), response, html: text };
}

function stripHtml(html: string) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function titleFromHtml(html: string) {
  return html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() || "";
}

const openInput = z.object({ url: z.string().url() });
const openOutput = z.object({ url: z.string(), status: z.number().int(), ok: z.boolean(), title: z.string(), htmlBytes: z.number().int().nonnegative() });
export const solBrowserOpenTool: SolTool<z.infer<typeof openInput>, z.infer<typeof openOutput>> = {
  name: "browser.open", description: "Open a public HTTPS page and return deterministic page metadata.", inputSchema: openInput, outputSchema: openOutput,
  permissions: ["read"], supportedEnvironments: ["local","development","preview","production"], idempotency: "not_required",
  async execute(input, context) {
    try {
      const page = await fetchHtml(input.url, context.signal);
      return { ok: true, data: { url: page.url, status: page.response.status, ok: page.response.ok, title: titleFromHtml(page.html), htmlBytes: Buffer.byteLength(page.html) }, observations: { finalUrl: page.url, status: page.response.status } };
    } catch (error) {
      return { ok: false, error: { code: error instanceof Error && error.name === "AbortError" ? "TIMEOUT" : "BROWSER_OPEN_FAILED", message: error instanceof Error ? error.message : "Unable to open page.", retryable: error instanceof Error && error.name === "AbortError" } };
    }
  }
};

const extractInput = z.object({ url: z.string().url(), maxChars: z.number().int().min(100).max(200_000).default(40_000), includeHtml: z.boolean().default(false) });
const extractOutput = z.object({ url: z.string(), status: z.number().int(), title: z.string(), text: z.string(), html: z.string().optional() });
export const solBrowserExtractTool: SolTool<z.infer<typeof extractInput>, z.infer<typeof extractOutput>> = {
  name: "browser.extract", description: "Extract readable text from a public HTTPS page without relying on AI.", inputSchema: extractInput, outputSchema: extractOutput,
  permissions: ["read"], supportedEnvironments: ["local","development","preview","production"], idempotency: "not_required",
  async execute(input, context) {
    try {
      const page = await fetchHtml(input.url, context.signal);
      const text = stripHtml(page.html).slice(0, input.maxChars);
      return { ok: true, data: { url: page.url, status: page.response.status, title: titleFromHtml(page.html), text, ...(input.includeHtml ? { html: page.html.slice(0, input.maxChars) } : {}) }, observations: { extractedChars: text.length } };
    } catch (error) {
      return { ok: false, error: { code: error instanceof Error && error.name === "AbortError" ? "TIMEOUT" : "BROWSER_EXTRACT_FAILED", message: error instanceof Error ? error.message : "Unable to extract page.", retryable: error instanceof Error && error.name === "AbortError" } };
    }
  }
};

const testInput = z.object({ url: z.string().url(), expectedStatus: z.number().int().min(100).max(599).default(200), textIncludes: z.array(z.string().min(1).max(500)).max(20).default([]), textExcludes: z.array(z.string().min(1).max(500)).max(20).default([]) });
const testOutput = z.object({ url: z.string(), passed: z.boolean(), status: z.number().int(), assertions: z.array(z.object({ assertion: z.string(), passed: z.boolean() })) });
export const solBrowserTestTool: SolTool<z.infer<typeof testInput>, z.infer<typeof testOutput>> = {
  name: "browser.test", description: "Run deterministic status/content smoke assertions against a public HTTPS page.", inputSchema: testInput, outputSchema: testOutput,
  permissions: ["read"], supportedEnvironments: ["local","development","preview","production"], idempotency: "not_required",
  async execute(input, context) {
    try {
      const page = await fetchHtml(input.url, context.signal);
      const text = stripHtml(page.html).toLowerCase();
      const assertions = [
        { assertion: `status=${input.expectedStatus}`, passed: page.response.status === input.expectedStatus },
        ...input.textIncludes.map((needle) => ({ assertion: `includes:${needle}`, passed: text.includes(needle.toLowerCase()) })),
        ...input.textExcludes.map((needle) => ({ assertion: `excludes:${needle}`, passed: !text.includes(needle.toLowerCase()) }))
      ];
      return { ok: true, data: { url: page.url, passed: assertions.every((item) => item.passed), status: page.response.status, assertions }, observations: { assertionCount: assertions.length, failed: assertions.filter((item) => !item.passed).length } };
    } catch (error) {
      return { ok: false, error: { code: error instanceof Error && error.name === "AbortError" ? "TIMEOUT" : "BROWSER_TEST_FAILED", message: error instanceof Error ? error.message : "Browser test failed.", retryable: error instanceof Error && error.name === "AbortError" } };
    }
  }
};

const screenshotInput = z.object({ url: z.string().url(), width: z.number().int().min(320).max(2560).default(1440), height: z.number().int().min(320).max(2560).default(1200), fullPage: z.boolean().default(true) });
const screenshotOutput = z.object({ url: z.string(), provider: z.string(), bytes: z.number().int().nonnegative(), contentType: z.string(), artifacts: z.array(z.object({ type: z.string(), title: z.string(), storageType: z.literal("file"), location: z.string(), metadata: z.record(z.string(), z.unknown()), verificationStatus: z.enum(["pending","passed","failed"]) })) });
export const solBrowserScreenshotTool: SolTool<z.infer<typeof screenshotInput>, z.infer<typeof screenshotOutput>> = {
  name: "browser.screenshot", description: "Capture a real rendered screenshot through the configured Browserless Chrome provider into the run-scoped runtime workspace.", inputSchema: screenshotInput, outputSchema: screenshotOutput,
  permissions: ["read"], supportedEnvironments: ["development","preview","production"], idempotency: "not_required",
  async execute(input, context) {
    try {
      await assertSolPublicHttps(input.url);
      const token = process.env.BROWSERLESS_API_TOKEN?.trim();
      const endpoint = process.env.BROWSERLESS_SCREENSHOT_URL?.trim() || "https://production-sfo.browserless.io/screenshot";
      if (!token) return { ok: false, error: { code: "AUTH_REQUIRED", message: "BROWSERLESS_API_TOKEN is not configured, so rendered screenshots are unavailable.", retryable: false } };
      const safeEndpoint = await assertSolPublicHttps(endpoint);
      safeEndpoint.searchParams.set("token", token);
      const response = await fetch(safeEndpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: input.url, options: { fullPage: input.fullPage, type: "png" }, gotoOptions: { waitUntil: "networkidle2", timeout: 45_000 }, viewport: { width: input.width, height: input.height } }),
        cache: "no-store",
        signal: context.signal
      });
      if (!response.ok) throw new Error(`Browserless screenshot failed (${response.status}).`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!bytes.byteLength) throw new Error("Browserless returned an empty screenshot.");
      if (bytes.byteLength > MAX_SCREENSHOT_BYTES) throw new Error(`Screenshot exceeds ${MAX_SCREENSHOT_BYTES} bytes.`);
      const root = path.join("/tmp", "sol-runtime", context.runId, "screenshots");
      await mkdir(root, { recursive: true });
      const filePath = path.join(root, `${context.taskId}.png`);
      await writeFile(filePath, bytes);
      return { ok: true, data: { url: input.url, provider: "browserless", bytes: bytes.byteLength, contentType: "image/png", artifacts: [{ type: "site_screenshot", title: `Screenshot ${new URL(input.url).hostname}`, storageType: "file", location: filePath, metadata: { sourceUrl: input.url, width: input.width, height: input.height, fullPage: input.fullPage, ephemeral: true, bytes: bytes.byteLength }, verificationStatus: "passed" }] } };
    } catch (error) {
      return { ok: false, error: { code: error instanceof Error && error.name === "AbortError" ? "TIMEOUT" : "BROWSER_SCREENSHOT_FAILED", message: error instanceof Error ? error.message : "Screenshot failed.", retryable: error instanceof Error && error.name === "AbortError" } };
    }
  }
};
