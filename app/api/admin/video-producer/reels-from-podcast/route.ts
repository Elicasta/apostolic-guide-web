import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";
import type { VideoProducerReelCandidate } from "@/video-producer-ai";

export const runtime = "nodejs";

const schema = z.object({ projectId: z.string().uuid(), candidateId: z.string().min(1).max(80) });

export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid candidate request." }, { status: 400 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });

  const parentResult = await service.from("video_producer_projects")
    .select("id,title,mode,status,pathway_slug,source_provider,source_locator,source_filename,source_mime_type,source_size_bytes,source_duration,transcript_text,transcript,reel_candidates,audio_plan")
    .eq("id", parsed.data.projectId).is("deleted_at", null).maybeSingle();
  if (parentResult.error) return NextResponse.json({ error: parentResult.error.message }, { status: 500 });
  const parent = parentResult.data;
  if (!parent || parent.mode !== "podcast" || !parent.source_locator) return NextResponse.json({ error: "Podcast source not found." }, { status: 404 });
  if (!["approved","rendering","review","completed"].includes(parent.status)) return NextResponse.json({ error: "Approve the podcast before creating reel projects." }, { status: 409 });

  const candidates = Array.isArray(parent.reel_candidates) ? parent.reel_candidates as unknown as VideoProducerReelCandidate[] : [];
  const candidate = candidates.find((item) => item && item.id === parsed.data.candidateId);
  if (!candidate || !Number.isFinite(candidate.start) || !Number.isFinite(candidate.end) || candidate.end <= candidate.start) {
    return NextResponse.json({ error: "Reel candidate was not found or has invalid timing." }, { status: 404 });
  }

  const existing = await service.from("video_producer_projects")
    .select("id,title,mode,status,parent_project_id,pathway_slug,source_range_start,source_range_end,audio_plan")
    .eq("parent_project_id", parent.id).eq("source_range_start", candidate.start).eq("source_range_end", candidate.end).is("deleted_at", null).maybeSingle();
  if (existing.error) return NextResponse.json({ error: existing.error.message }, { status: 500 });
  if (existing.data) {
    const patch: Record<string, unknown> = {};
    if (!existing.data.pathway_slug && parent.pathway_slug) patch.pathway_slug = parent.pathway_slug;
    if (JSON.stringify(existing.data.audio_plan || {}) !== JSON.stringify(parent.audio_plan || {})) {
      patch.audio_plan = parent.audio_plan || { version: 1, source: "camera_a" };
      patch.camera_plan = null;
      patch.approval_fingerprint = null;
      patch.approved_at = null;
    }
    if (Object.keys(patch).length) await service.from("video_producer_projects").update({ ...patch, updated_by: access.user.id }).eq("id", existing.data.id);
    return NextResponse.json({ project: { ...existing.data, ...patch }, created: false });
  }

  const created = await service.from("video_producer_projects").insert({
    title: candidate.title || `${parent.title} · Reel`,
    mode: "reels",
    status: "uploaded",
    parent_project_id: parent.id,
    pathway_slug: parent.pathway_slug ?? null,
    source_provider: parent.source_provider,
    source_locator: parent.source_locator,
    source_filename: parent.source_filename,
    source_mime_type: parent.source_mime_type,
    source_size_bytes: parent.source_size_bytes,
    source_duration: parent.source_duration,
    source_range_start: candidate.start,
    source_range_end: candidate.end,
    transcript_text: parent.transcript_text,
    transcript: parent.transcript,
    audio_plan: parent.audio_plan || { version: 1, source: "camera_a" },
    camera_plan: null,
    director_metadata: { inheritedFromPodcast: parent.id, candidate },
    created_by: access.user.id,
    updated_by: access.user.id
  }).select("*").single();
  if (created.error) return NextResponse.json({ error: created.error.message }, { status: 500 });
  return NextResponse.json({ project: created.data, created: true }, { status: 201 });
}
