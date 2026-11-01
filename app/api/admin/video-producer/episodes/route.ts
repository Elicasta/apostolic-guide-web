import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { allPathways, pathwayBySlug } from "@/pathway-catalog";
import { createServiceClient } from "@/supabase";
import { EPISODE_FORMATS, episodeSpeakerSchema } from "@/video-producer-episode-script";

const createSchema = z.object({
  title: z.string().trim().min(1).max(180),
  premise: z.string().trim().min(3).max(6000),
  primaryPathwaySlug: z.string().trim().min(1).max(100),
  supportingPathwaySlugs: z.array(z.string().trim().min(1).max(100)).max(5).optional().default([]),
  format: z.enum(EPISODE_FORMATS).default("solo"),
  speakers: z.array(episodeSpeakerSchema).min(1).max(4)
});

function pathwayPayload() {
  return allPathways.map((pathway) => ({
    slug: pathway.slug,
    title: pathway.title,
    summary: pathway.summary,
    collection: pathway.collection,
    steps: pathway.steps.map((step) => ({ title: step.title, reference: step.reference, explanation: step.explanation }))
  }));
}

export async function GET() {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });
  const result = await service.from("video_producer_episode_scripts")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(100);
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
  return NextResponse.json({ episodes: result.data ?? [], pathways: pathwayPayload() });
}

export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid episode request." }, { status: 400 });
  const primary = pathwayBySlug(parsed.data.primaryPathwaySlug);
  if (!primary) return NextResponse.json({ error: "Primary Pathway was not found." }, { status: 400 });
  const supporting = [...new Set(parsed.data.supportingPathwaySlugs)].filter((slug) => slug !== primary.slug);
  if (supporting.some((slug) => !pathwayBySlug(slug))) return NextResponse.json({ error: "One of the supporting Pathways was not found." }, { status: 400 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });

  const created = await service.from("video_producer_episode_scripts").insert({
    title: parsed.data.title,
    premise: parsed.data.premise,
    primary_pathway_slug: primary.slug,
    supporting_pathway_slugs: supporting,
    format: parsed.data.format,
    speakers: parsed.data.speakers,
    status: "draft",
    created_by: access.user.id,
    updated_by: access.user.id
  }).select("*").single();
  if (created.error) return NextResponse.json({ error: created.error.message }, { status: 500 });
  return NextResponse.json({ episode: created.data }, { status: 201 });
}
