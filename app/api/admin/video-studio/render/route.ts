import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { pathwayBySlug } from "@/pathway-catalog";
import { createServiceClient } from "@/supabase";

export const runtime = "nodejs";
export const maxDuration = 30;

const schema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  formats: z.array(z.enum(["youtube", "vertical", "square"])).min(1).max(3)
});

export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid render request." }, { status: 400 });
  const pathway = pathwayBySlug(parsed.data.slug);
  if (!pathway) return NextResponse.json({ error: "Pathway not found." }, { status: 404 });

  const token = process.env.VIDEO_STUDIO_GITHUB_TOKEN?.trim();
  const repository = process.env.VIDEO_STUDIO_GITHUB_REPOSITORY?.trim() || "Elicasta/apostolic-guide-web";
  if (!token) return NextResponse.json({ error: "Video renderer is not connected yet. Add VIDEO_STUDIO_GITHUB_TOKEN to the deployment environment." }, { status: 503 });

  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });

  const [projectResult, assetResult] = await Promise.all([
    service.from("pathway_video_projects").select("id,audio_content_hash,timeline,style").eq("pathway_slug", pathway.slug).maybeSingle(),
    service.from("pathway_audio_assets").select("audio_url,content_hash").eq("pathway_slug", pathway.slug).maybeSingle()
  ]);
  if (projectResult.error) return NextResponse.json({ error: projectResult.error.message }, { status: 500 });
  if (assetResult.error) return NextResponse.json({ error: assetResult.error.message }, { status: 500 });
  if (!projectResult.data) return NextResponse.json({ error: "Save the video timeline before rendering." }, { status: 409 });
  if (!assetResult.data?.audio_url) return NextResponse.json({ error: "Pathway audio is missing." }, { status: 409 });
  if (projectResult.data.audio_content_hash !== assetResult.data.content_hash) return NextResponse.json({ error: "The Pathway audio changed after this video timeline was saved. Review and save the timeline again before rendering." }, { status: 409 });

  const queued = [];
  for (const format of [...new Set(parsed.data.formats)]) {
    const snapshot = {
      version: 1,
      pathway: { slug: pathway.slug, title: pathway.title, summary: pathway.summary },
      format,
      audioUrl: assetResult.data.audio_url,
      audioContentHash: assetResult.data.content_hash,
      timeline: projectResult.data.timeline,
      style: projectResult.data.style
    };
    const created = await service.from("pathway_video_renders").insert({
      pathway_slug: pathway.slug,
      project_id: projectResult.data.id,
      format,
      status: "queued",
      config_snapshot: snapshot,
      requested_by: access.user.id
    }).select("id,pathway_slug,format,status,output_url,error,requested_at,completed_at").single();
    if (created.error) return NextResponse.json({ error: created.error.message }, { status: 500 });

    const render = created.data;
    const dispatch = await fetch(`https://api.github.com/repos/${repository}/dispatches`, {
      method: "POST",
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "user-agent": "apostolic-guide-video-studio",
        "x-github-api-version": "2022-11-28"
      },
      body: JSON.stringify({
        event_type: "pathway-video-render",
        client_payload: {
          job_id: render.id,
          slug: pathway.slug,
          title: pathway.title,
          format,
          audio_url: assetResult.data.audio_url,
          timeline: projectResult.data.timeline,
          style: projectResult.data.style
        }
      })
    });

    if (!dispatch.ok) {
      const detail = (await dispatch.text().catch(() => "")).slice(0, 800);
      const error = `Renderer dispatch failed (${dispatch.status})${detail ? `: ${detail}` : ""}`;
      await service.from("pathway_video_renders").update({ status: "failed", error, completed_at: new Date().toISOString() }).eq("id", render.id);
      return NextResponse.json({ error }, { status: 502 });
    }
    queued.push(render);
  }

  return NextResponse.json({ renders: queued });
}
