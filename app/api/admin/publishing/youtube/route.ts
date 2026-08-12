import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { normalizePathwayVideoPublishingMetadata } from "@/pathway-video-publishing";
import { getSocialPublishingCredentialValues } from "@/social-publishing-integrations";
import { createServiceClient } from "@/supabase";

export const runtime = "nodejs";
export const maxDuration = 300;

const schema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  renderId: z.string().uuid(),
  privacyStatus: z.enum(["private", "unlisted", "public"]).default("private")
});

type TokenResponse = { access_token?: string; expires_in?: number; error?: string; error_description?: string };
type VideoResponse = { id?: string; status?: { privacyStatus?: string }; error?: { message?: string } };

async function accessToken() {
  const credentials = await getSocialPublishingCredentialValues("youtube") as Record<string, string>;
  if (!credentials.clientId || !credentials.clientSecret || !credentials.refreshToken) {
    throw new Error("YouTube is not authorized. Open Setup and connect YouTube first.");
  }
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      refresh_token: credentials.refreshToken,
      grant_type: "refresh_token"
    })
  });
  const data = await response.json().catch(() => ({})) as TokenResponse;
  if (!response.ok || !data.access_token) throw new Error(data.error_description || data.error || `Google token refresh failed (${response.status}).`);
  return data.access_token;
}

export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_distribution");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid YouTube publishing request." }, { status: 400 });

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
  if (!render || render.format !== "youtube" || render.status !== "completed" || !render.output_url) {
    return NextResponse.json({ error: "A completed YouTube 16:9 render is required before publishing." }, { status: 409 });
  }
  if (!kitResult.data) return NextResponse.json({ error: "Generate and save the publishing kit before publishing." }, { status: 409 });
  const metadata = normalizePathwayVideoPublishingMetadata(kitResult.data.metadata);
  if (!metadata.youtubeTitle || !metadata.youtubeDescription) return NextResponse.json({ error: "YouTube title and description are required." }, { status: 409 });

  const existing = await service.from("pathway_publications")
    .select("id,status,published_url")
    .eq("asset_id", render.asset_id)
    .eq("platform", "youtube")
    .in("status", ["publishing", "published"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing.error) return NextResponse.json({ error: existing.error.message }, { status: 500 });
  if (existing.data?.status === "published") return NextResponse.json({ error: "This render is already published to YouTube.", publishedUrl: existing.data.published_url }, { status: 409 });
  if (existing.data?.status === "publishing") return NextResponse.json({ error: "This render is already being published to YouTube." }, { status: 409 });

  const publication = await service.from("pathway_publications").insert({
    pathway_slug: parsed.data.slug,
    asset_id: render.asset_id,
    platform: "youtube",
    status: "publishing",
    metadata: {
      render_id: render.id,
      requested_privacy: parsed.data.privacyStatus,
      title: metadata.youtubeTitle
    }
  }).select("id").single();
  if (publication.error) return NextResponse.json({ error: publication.error.message }, { status: 500 });

  try {
    const token = await accessToken();
    const sourceResponse = await fetch(render.output_url, { cache: "no-store" });
    if (!sourceResponse.ok) throw new Error(`Finished MP4 could not be loaded (${sourceResponse.status}).`);
    const videoBytes = Buffer.from(await sourceResponse.arrayBuffer());
    if (!videoBytes.length) throw new Error("Finished MP4 is empty.");

    const hashtags = metadata.youtubeHashtags.map((tag) => tag.startsWith("#") ? tag : `#${tag.replace(/^#+/, "")}`).join(" ");
    const description = hashtags ? `${metadata.youtubeDescription.trim()}\n\n${hashtags}`.slice(0, 5000) : metadata.youtubeDescription.trim();
    const body = {
      snippet: {
        title: metadata.youtubeTitle,
        description,
        tags: metadata.youtubeTags,
        categoryId: "27",
        defaultLanguage: "en",
        defaultAudioLanguage: "en"
      },
      status: {
        privacyStatus: parsed.data.privacyStatus,
        embeddable: true,
        selfDeclaredMadeForKids: false
      }
    };

    const init = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json; charset=UTF-8",
        "x-upload-content-length": String(videoBytes.length),
        "x-upload-content-type": "video/mp4"
      },
      body: JSON.stringify(body)
    });
    if (!init.ok) {
      const detail = (await init.text().catch(() => "")).slice(0, 1800);
      throw new Error(`YouTube upload session failed (${init.status})${detail ? `: ${detail}` : ""}`);
    }
    const uploadUrl = init.headers.get("location");
    if (!uploadUrl) throw new Error("YouTube did not return a resumable upload URL.");

    const upload = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "video/mp4",
        "content-length": String(videoBytes.length)
      },
      body: videoBytes
    });
    const result = await upload.json().catch(() => ({})) as VideoResponse;
    if (!upload.ok || !result.id) throw new Error(result.error?.message || `YouTube video upload failed (${upload.status}).`);

    const publishedUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(result.id)}`;
    const now = new Date().toISOString();
    const updates = await Promise.all([
      service.from("pathway_publications").update({
        status: "published",
        external_post_id: result.id,
        published_url: publishedUrl,
        published_at: now,
        error_message: null,
        metadata: {
          render_id: render.id,
          requested_privacy: parsed.data.privacyStatus,
          actual_privacy: result.status?.privacyStatus ?? null,
          title: metadata.youtubeTitle
        }
      }).eq("id", publication.data.id),
      render.asset_id ? service.from("pathway_assets").update({
        status: "published",
        published_url: publishedUrl,
        published_at: now
      }).eq("id", render.asset_id) : Promise.resolve({ error: null })
    ]);
    const updateError = updates.find((item) => item.error)?.error;
    if (updateError) throw new Error(updateError.message);

    return NextResponse.json({
      ok: true,
      videoId: result.id,
      publishedUrl,
      privacyStatus: result.status?.privacyStatus ?? parsed.data.privacyStatus,
      message: "YouTube upload completed. YouTube may still be processing HD playback."
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "YouTube publishing failed.";
    await service.from("pathway_publications").update({
      status: "failed",
      error_message: message.slice(0, 1800)
    }).eq("id", publication.data.id);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
