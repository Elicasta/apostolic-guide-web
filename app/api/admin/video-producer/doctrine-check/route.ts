import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";
import { currentDoctrineVerdict, recordDoctrineCheck } from "@/doctrine-gate";
import { videoProducerDoctrineSource } from "@/video-producer-doctrine";
import { recordStudioAudit } from "@/studio-audit";

export const runtime = "nodejs";
export const maxDuration = 120;

const schema = z.object({ projectId: z.string().uuid(), note: z.string().trim().min(12).max(2000).optional() });
type Service = NonNullable<ReturnType<typeof createServiceClient>>;

async function storedSource(service: Service, projectId: string) {
  const result = await service.from("video_producer_projects")
    .select("id,mode,edit_plan,director_metadata,transcript,transcript_local_text,pathway_slug")
    .eq("id", projectId).is("deleted_at", null).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  if (!result.data) throw new Error("Video project not found.");
  return videoProducerDoctrineSource(result.data);
}

function failure(error: unknown) {
  return NextResponse.json({ error: error instanceof Error ? error.message : "Doctrine review unavailable. Approval blocked." }, { status: 409 });
}

export async function GET(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = z.string().uuid().safeParse(new URL(request.url).searchParams.get("projectId"));
  if (!parsed.success) return NextResponse.json({ error: "Invalid project ID." }, { status: 400 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Doctrine storage unavailable." }, { status: 503 });
  try {
    const source = await storedSource(service, parsed.data);
    return NextResponse.json({ ...await currentDoctrineVerdict(service, source), canOverride: access.role === "owner" });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid doctrine check request." }, { status: 400 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Doctrine storage unavailable." }, { status: 503 });
  try {
    const source = await storedSource(service, parsed.data.projectId);
    const checked = await recordDoctrineCheck(service, source, access.user.id);
    return NextResponse.json({ ...checked, state: checked.review.status });
  } catch (error) { return failure(error); }
}

export async function PATCH(request: Request) {
  const { access } = await getStudioPermission("manage_content");
  if (access.state !== "allowed" || access.role !== "owner" || !access.user) {
    return NextResponse.json({ error: "Only the owner can override a flagged doctrine result." }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !parsed.data.note) {
    return NextResponse.json({ error: "An owner approval reason of at least 12 characters is required." }, { status: 400 });
  }
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Doctrine storage unavailable." }, { status: 503 });
  try {
    const source = await storedSource(service, parsed.data.projectId);
    const current = await currentDoctrineVerdict(service, source);
    if (current.state !== "flag" || !current.verdict) {
      return NextResponse.json({ error: "Only the latest matching FLAG can be overridden. FAIL and unchecked content remain blocked." }, { status: 409 });
    }
    const audited = await recordStudioAudit({
      actorUserId: access.user.id, action: "doctrine.override",
      resourceType: source.sourceType, resourceId: source.sourceId,
      metadata: { hash: current.hash, verdictId: current.verdict.id, model: current.verdict.model, status: "flagged_approved", note: parsed.data.note }
    });
    if (!audited) throw new Error("Audit log unavailable. Approval blocked.");
    const approvedAt = new Date().toISOString();
    const updated = await service.from("studio_doctrine_verdicts")
      .update({ override_note: parsed.data.note, override_by: access.user.id, approved_at: approvedAt })
      .eq("id", current.verdict.id).eq("status", "flag").is("approved_at", null).select("id").maybeSingle();
    if (updated.error || !updated.data) throw new Error("Approval conflict. Refresh the doctrine check.");
    return NextResponse.json({ state: "flagged_approved", approvedAt });
  } catch (error) { return failure(error); }
}
