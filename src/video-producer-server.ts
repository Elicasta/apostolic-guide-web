import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { del, issueSignedToken, presignUrl, put } from "@vercel/blob";
import type { createServiceClient } from "./supabase";
import { videoProducerMulticamFingerprintState } from "./video-producer-multicam";

export type ServiceClient = NonNullable<ReturnType<typeof createServiceClient>>;

export function extractOpenAIResponseText(value: unknown) {
  const response = value && typeof value === "object" ? value as Record<string, unknown> : {};
  if (typeof response.output_text === "string") return response.output_text;
  if (!Array.isArray(response.output)) return "";
  for (const item of response.output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const record = part as Record<string, unknown>;
      if (record.type === "output_text" && typeof record.text === "string") return record.text;
    }
  }
  return "";
}

export function createWorkerCallbackToken() {
  const token = randomBytes(32).toString("hex");
  return { token, hash: createHash("sha256").update(token).digest("hex") };
}

export function workerTokenMatches(raw: string, expectedHash: string) {
  const actual = createHash("sha256").update(raw).digest();
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function videoProducerPlanFingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function videoProducerApprovalFingerprint(plan: unknown, directorMetadata: unknown) {
  const multicam = videoProducerMulticamFingerprintState(directorMetadata);
  return multicam ? videoProducerPlanFingerprint({ plan, multicam }) : videoProducerPlanFingerprint(plan);
}

export function videoProducerWorkerRef() {
  // Rendering must use a ref that contains the stable worker workflow. A Vercel
  // preview branch may change UI code without containing a runnable worker, so
  // never infer the renderer ref from VERCEL_GIT_COMMIT_REF.
  return process.env.VIDEO_PRODUCER_WORKER_REF?.trim() || "main";
}

export function videoProducerOpenAIKey() {
  return process.env.VIDEO_PRODUCER_OPENAI_API_KEY?.trim() || "";
}

export async function videoProducerRendererCredentials(service: ServiceClient) {
  let token = process.env.VIDEO_STUDIO_GITHUB_TOKEN?.trim() || "";
  let repository = process.env.VIDEO_STUDIO_GITHUB_REPOSITORY?.trim() || "Elicasta/apostolic-guide-web";
  if (token) return { token, repository };
  const result = await service.schema("analytics").from("integration_secrets")
    .select("name,secret")
    .in("name", ["video_studio_github_token", "video_studio_github_repository"]);
  if (result.error) throw new Error(result.error.message);
  const values = new Map((result.data ?? []).map((row) => [row.name, row.secret]));
  token = values.get("video_studio_github_token")?.trim() || "";
  repository = values.get("video_studio_github_repository")?.trim() || repository;
  return { token, repository };
}

export async function createPrivateBlobDownloadUrl(pathname: string, ttlMs = 2 * 60 * 60 * 1000) {
  const validUntil = Date.now() + ttlMs;
  const token = await issueSignedToken({ pathname, operations: ["get"], validUntil });
  const { presignedUrl } = await presignUrl(token, {
    operation: "get", pathname, access: "private", validUntil, useCache: false
  });
  return presignedUrl;
}

export async function createPrivateBlobUploadUrl(input: {
  pathname: string;
  contentType: string;
  maxBytes: number;
  ttlMs?: number;
}) {
  const validUntil = Date.now() + (input.ttlMs ?? 2 * 60 * 60 * 1000);
  const token = await issueSignedToken({
    pathname: input.pathname,
    operations: ["put"],
    allowedContentTypes: [input.contentType],
    maximumSizeInBytes: input.maxBytes,
    validUntil
  });
  const { presignedUrl } = await presignUrl(token, {
    operation: "put",
    pathname: input.pathname,
    access: "private",
    allowedContentTypes: [input.contentType],
    maximumSizeInBytes: input.maxBytes,
    validUntil,
    addRandomSuffix: false,
    allowOverwrite: true
  });
  return presignedUrl;
}

export async function storeVideoProducerManifest(pathname: string, manifest: unknown) {
  return put(pathname, JSON.stringify(manifest), {
    access: "private",
    addRandomSuffix: false,
    contentType: "application/json"
  });
}

export async function deletePrivateVideoProducerBlob(pathname: string) {
  try {
    await del(pathname);
  } catch (error) {
    console.error("Video Producer blob cleanup failed", pathname, error);
  }
}

export async function dispatchVideoProducerWorker(input: {
  token: string;
  repository: string;
  eventType: "video-producer-transcribe" | "video-producer-render" | "video-producer-multicam-analyze" | "video-producer-thumbnail" | "video-producer-publisher-handoff";
  payload: Record<string, unknown>;
}) {
  const response = await fetch(`https://api.github.com/repos/${input.repository}/dispatches`, {
    method: "POST",
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${input.token}`,
      "content-type": "application/json",
      "user-agent": "apostolic-guide-video-producer",
      "x-github-api-version": "2022-11-28"
    },
    body: JSON.stringify({ event_type: input.eventType, client_payload: input.payload })
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 1000);
    throw new Error(`Worker dispatch failed (${response.status})${detail ? `: ${detail}` : ""}`);
  }
}
