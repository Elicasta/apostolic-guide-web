import { setTimeout as wait } from "node:timers/promises";

// A publish request may be retried only after Meta explicitly rejected it as not ready.
// Unknown outcomes must be reconciled manually rather than risk posting twice.
type GraphError = { message?: string; code?: number; error_subcode?: number };
type GraphData = { id?: string; status_code?: string; error?: GraphError };
type RequestOptions = {
  fetcher?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  maxChecks?: number;
  pollIntervalMs?: number;
  retryDelayMs?: number;
};

type ContainerOptions = RequestOptions & {
  base: string;
  containerId: string;
  accessToken: string;
  deadlineAt: number;
};

type PublishOptions = ContainerOptions & {
  userId: string;
  beforePublish: (containerId: string) => Promise<void>;
  afterPublish: (mediaId: string) => Promise<void>;
};

class InstagramGraphError extends Error {
  readonly code?: number;
  readonly subcode?: number;

  constructor(message: string, error?: GraphError) {
    super(message);
    this.name = "InstagramGraphError";
    this.code = error?.code;
    this.subcode = error?.error_subcode;
  }
}

async function graphRequest(url: string, init: RequestInit | undefined, fetcher: typeof fetch): Promise<GraphData> {
  const response = await fetcher(url, init);
  const data = await response.json().catch(() => ({})) as GraphData;
  if (!response.ok || data.error) {
    throw new InstagramGraphError(data.error?.message || "Instagram API request failed (" + response.status + ").", data.error);
  }
  return data;
}

export async function waitForInstagramContainer(options: ContainerOptions): Promise<void> {
  const {
    base, containerId, accessToken, deadlineAt,
    fetcher = fetch, sleep = wait, now = Date.now,
    maxChecks = 20, pollIntervalMs = 1500
  } = options;
  for (let attempt = 0; attempt < maxChecks; attempt += 1) {
    if (now() >= deadlineAt) throw new Error("Instagram processing deadline exceeded; no publish was attempted.");
    const params = new URLSearchParams({ fields: "status_code,status", access_token: accessToken });
    const current = await graphRequest(base + "/" + encodeURIComponent(containerId) + "?" + params.toString(), undefined, fetcher);
    switch (current.status_code) {
      case "FINISHED":
        return;
      case "ERROR":
      case "EXPIRED":
        throw new Error("Instagram media container " + containerId + " ended with " + current.status_code + ".");
      case "PUBLISHED":
        throw new Error("Instagram container " + containerId + " is already PUBLISHED. Verify the Instagram feed before retrying.");
      case "IN_PROGRESS":
      case undefined:
      case null:
        break;
      default:
        throw new Error("Unrecognized Instagram container status: " + String(current.status_code));
    }
    if (attempt < maxChecks - 1) {
      if (now() + pollIntervalMs >= deadlineAt) throw new Error("Instagram processing deadline exceeded; no publish was attempted.");
      await sleep(pollIntervalMs);
    }
  }
  throw new Error("Instagram media container " + containerId + " did not reach FINISHED. No publish was attempted.");
}

function definitelyNotReady(error: unknown): boolean {
  if (!(error instanceof InstagramGraphError)) return false;
  return error.subcode === 2207027 ||
    /media id is not available|media is not ready|not ready for publish/i.test(error.message);
}

export async function publishReadyInstagramContainer(options: PublishOptions): Promise<string> {
  const {
    base, containerId, userId, accessToken, deadlineAt,
    fetcher = fetch, sleep = wait, now = Date.now, retryDelayMs = 3000,
    beforePublish, afterPublish
  } = options;
  await waitForInstagramContainer(options);
  // Save the attempt before the first non-idempotent external side effect.
  await beforePublish(containerId);
  const params = new URLSearchParams({ creation_id: containerId, access_token: accessToken });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let mediaId: string | undefined;
    try {
      const result = await graphRequest(base + "/" + encodeURIComponent(userId) + "/media_publish?" + params.toString(), { method: "POST" }, fetcher);
      mediaId = result.id;
      if (!mediaId) throw new Error("Instagram publish returned no media ID. Outcome unknown; verify the feed before retrying.");
    } catch (error) {
      // Never retry timeouts, network failures, 5xx, missing IDs, or unrelated Meta errors.
      if (!definitelyNotReady(error) || attempt === 2 || now() + retryDelayMs >= deadlineAt) throw error;
      await sleep(retryDelayMs);
      // Recheck the SAME container. PUBLISHED is an unknown outcome and blocks a retry.
      await waitForInstagramContainer(options);
      continue;
    }
    // Store Meta's acknowledgment before any permalink lookup or project status update.
    await afterPublish(mediaId);
    return mediaId;
  }
  throw new Error("Instagram media was not ready after three confirmed rejections.");
}
