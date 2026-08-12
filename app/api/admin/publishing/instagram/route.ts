import { setTimeout as wait } from "node:timers/promises";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { normalizePathwayVideoPublishingMetadata } from "@/pathway-video-publishing";
import { getSocialPublishingCredentialValues } from "@/social-publishing-integrations";
import { createServiceClient } from "@/supabase";

export const runtime = "nodejs";
export const maxDuration = 180;

const schema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  renderId: z.string().uuid()
});

type GraphResponse = { id?: string; status_code?: string; permalink?: string; error?: { message?: string; type?: string; code?: number } };

function graphError(data: GraphResponse, fallback: string) {
  return data.error?.message ? `${fallback}: ${data.error.message}` : fallback;
}

async function graphJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({})) as GraphResponse;
  if (!response.ok || data.error) throw new Error(graphError(data, `Instagram API request failed (${response.status})`));
  return data;
}

export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_distribution");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid Instagram publishing request." }, { status: 400 });

  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });

  const [renderResult, kitResult] = await Promise.all([
    service.from("pathway_video_renders")
      .select("id,pathway_slug,asset_id,format,status,output_url")
      .eq("id", parsed.data.renderId)
      .eq("pathway_slug", parsed.data.slug)
      .maybeSingle(),
    service.from("pathway_video_publishing_kits")
      .select("metadata")
      .eq("pathway_slug", parsed.data.slug)
      .maybeSingle()
  ]);
  if (renderResult.error) return NextResponse.json({ error: renderResult.error.message }, { status: 500 });
  if (kitResult.error) return NextResponse.json({ error: kitResult.error.message }, { status: 500 });
  const render = renderResult.data;
  if (!render || render.format !== "vertical" || render.status !== "completed" || !render.output_url) {
    return NextResponse.json({ error: "A completed 9:16 render is required before publishing an Instagram Reel." }, { status: 409 });
  }
  if (!kitResult.data) return NextResponse.json({ error: "Generate and save the publishing kit before publishing." }, { status: 409 });
  const metadata = normalizePathwayVideoPublishingMetadata(kitResult.data.metadata);
  if (!metadata.reelCaption) return NextResponse.json({ error: "Instagram Reel caption is required." }, { status: 409 });

  const credentials = await getSocialPublishingCredentialValues("instagram") as Record<string, string>;
  if (!credentials.accessToken || !credentials.instagramUserId) {
    return NextResponse.json({ error: "Instagram publishing credentials are missing. Open Setup and reconnect Instagram." }, { status: 409 });
  }
  const version = /^v\d+\.\d+$/.test(credentials.graphVersion || "") ? credentials.graphVersion : "v24.0";
  const base = `https://graph.facebook.com/${version}`;

  const existing = await service.from("pathway_publications")
    .select("id,status,published_url")
    .eq("asset_id", render.asset_id)
    .eq("platform", "instagram")
    .in("status", ["publishing", "published"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing.error) return NextResponse.json({ error: existing.error.message }, { status: 500 });
  if (existing.data?.status === "published") return NextResponse.json({ error: "This render is already published to Instagram.", publishedUrl: existing.data.published_url }, { status: 409 });
  if (existing.data?.status === "publishing") return NextResponse.json({ error: "This render is already being published to Instagram." }, { status: 409 });

  const publication = await service.from("pathway_publications").insert({
    pathway_slug: parsed.data.slug,
    asset_id: render.asset_id,
    platform: "instagram",
    status: "publishing",
    metadata: { render_id: render.id, caption: metadata.reelCaption }
  }).select("id").single();
  if (publication.error) return NextResponse.json({ error: publication.error.message }, { status: 500 });

  try {
    const tags = metadata.socialHashtags.map((tag) => tag.startsWith("#") ? tag : `#${tag.replace(/^#+/, "")}`).join(" ");
    const caption = tags ? `${metadata.reelCaption.trim()}\n\n${tags}`.slice(0, 2200) : metadata.reelCaption.trim();
    const createParams = new URLSearchParams({
      media_type: "REELS",
      video_url: render.output_url,
      caption,
      share_to_feed: "true",
      access_token: credentials.accessToken
    });
    const container = await graphJson(`${base}/${encodeURIComponent(credentials.instagramUserId)}/media?${createParams.toString()}`, { method: "POST" });
    if (!container.id) throw new Error("Instagram did not return a Reel container ID.");

    let status = "IN_PROGRESS";
    for (let attempt = 0; attempt < 18; attempt += 1) {
      const statusParams = new URLSearchParams({ fields: "status_code", access_token: credentials.accessToken });
      const current = await graphJson(`${base}/${encodeURIComponent(container.id)}?${statusParams.toString()}`);
      status = current.status_code || status;
      if (status === "FINISHED") break;
      if (["ERROR", "EXPIRED"].includes(status)) throw new Error(`Instagram Reel processing ended with ${status}.`);
      await wait(4000);
    }
    if (status !== "FINISHED") throw new Error("Instagram Reel is still processing. Try publishing again after the video finishes processing.");

    const publishParams = new URLSearchParams({ creation_id: container.id, access_token: credentials.accessToken });
    const published = await graphJson(`${base}/${encodeURIComponent(credentials.instagramUserId)}/media_publish?${publishParams.toString()}`, { method: "POST" });
    if (!published.id) throw new Error("Instagram did not return a published media ID.");

    let permalink: string | null = null;
    try {
      const permalinkParams = new URLSearchParams({ fields: "permalink", access_token: credentials.accessToken });
      const media = await graphJson(`${base}/${encodeURIComponent(published.id)}?${permalinkParams.toString()}`);
      permalink = media.permalink || null;
    } catch {
      permalink = null;
    }

    const now = new Date().toISOString();
    const updates = await Promise.all([
      service.from("pathway_publications").update({
        status: "published",
        external_post_id: published.id,
        published_url: permalink,
        published_at: now,
        error_message: null,
        metadata: { render_id: render.id, container_id: container.id, caption }
      }).eq("id", publication.data.id),
      render.asset_id ? service.from("pathway_assets").update({
        status: "published",
        published_url: permalink,
        published_at: now
      }).eq("id", render.asset_id) : Promise.resolve({ error: null })
    ]);
    const updateError = updates.find((item) => item.error)?.error;
    if (updateError) throw new Error(updateError.message);

    return NextResponse.json({
      ok: true,
      mediaId: published.id,
      publishedUrl: permalink,
      message: permalink ? "Instagram Reel published." : "Instagram Reel published. The permalink will populate after Meta finishes indexing it."
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Instagram publishing failed.";
    await service.from("pathway_publications").update({ status: "failed", error_message: message.slice(0, 1800) }).eq("id", publication.data.id);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
