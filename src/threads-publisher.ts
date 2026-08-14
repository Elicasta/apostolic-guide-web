import { createServiceClient } from "./supabase";
import { getThreadsCredentialValues } from "./threads-meta";

type ThreadsApiResponse = { id?: string; permalink?: string; error?: { message?: string } };

async function threadsRequest(path: string, params: Record<string,string>, method: "GET"|"POST" = "POST") {
  const credentials = await getThreadsCredentialValues();
  if (!credentials.accessToken || !credentials.userId) throw new Error("Threads is not connected yet.");
  const url = new URL(`https://graph.threads.net/v1.0${path}`);
  for (const [key,value] of Object.entries(params)) url.searchParams.set(key,value);
  const response = await fetch(url, {
    method,
    headers: { authorization: `Bearer ${credentials.accessToken}` },
    cache: "no-store"
  });
  const data = await response.json().catch(() => ({})) as ThreadsApiResponse;
  if (!response.ok) throw new Error(data.error?.message || `Threads API request failed (${response.status}).`);
  return data;
}

export async function publishThreadsText(text: string) {
  const clean = text.trim();
  if (!clean) throw new Error("Thread text is empty.");
  if (clean.length > 500) throw new Error("Thread text exceeds 500 characters.");
  const container = await threadsRequest("/me/threads", { media_type: "TEXT", text: clean });
  if (!container.id) throw new Error("Threads did not return a creation container ID.");
  const published = await threadsRequest("/me/threads_publish", { creation_id: container.id });
  if (!published.id) throw new Error("Threads did not return a published post ID.");
  let permalink: string | null = null;
  try {
    const detail = await threadsRequest(`/${encodeURIComponent(published.id)}`, { fields: "id,permalink" }, "GET");
    permalink = detail.permalink?.trim() || null;
  } catch {
    // Publishing succeeded even if permalink lookup is temporarily unavailable.
  }
  return { id: published.id, permalink };
}

export async function publishScheduledThreadsPost(postId: string) {
  const service = createServiceClient();
  if (!service) throw new Error("Supabase service access is not configured.");
  const row = await service.from("studio_threads_posts")
    .select("id,body,status,scheduled_for")
    .eq("id", postId)
    .single();
  if (row.error || !row.data) throw new Error(row.error?.message || "Scheduled Threads post not found.");
  if (row.data.status !== "scheduled") return { skipped: true };
  await service.from("studio_threads_posts").update({ status: "publishing", updated_at: new Date().toISOString() }).eq("id", postId);
  try {
    const result = await publishThreadsText(String(row.data.body));
    const now = new Date().toISOString();
    await service.from("studio_threads_posts").update({ status: "published", published_at: now, threads_post_id: result.id, threads_permalink: result.permalink, updated_at: now }).eq("id", postId);
    await service.from("studio_content_calendar_items").update({ status: "published", metadata: { threads_post_id: postId, external_post_id: result.id, permalink: result.permalink }, updated_at: now }).eq("source", "threads-studio").eq("source_ref", postId);
    return { skipped: false, ...result };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Threads publishing failed.";
    await service.from("studio_threads_posts").update({ status: "failed", metadata: { publish_error: message }, updated_at: new Date().toISOString() }).eq("id", postId);
    throw error;
  }
}
