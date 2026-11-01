import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";
import { pathwayBySlug } from "@/pathway-catalog";
import { recordStudioAudit } from "@/studio-audit";

export const runtime = "nodejs";
const schema = z.object({
  action: z.enum(["save", "approve", "reject", "publish"]),
  title: z.string().trim().max(400),
  explanation: z.string().trim().max(6000),
  hook: z.string().trim().max(2400),
  adminNotes: z.string().trim().max(4000),
});
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const permission = await getStudioPermission("manage_content");
  if (!permission.allowed || permission.access.state !== "allowed" || !permission.access.user) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid review ID." }, { status: 400 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid review update." }, { status: 400 });
  const input = parsed.data;
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Review storage is unavailable." }, { status: 503 });
  const { data: row, error: readError } = await service.from("ekegusii_corrections").select("*").eq("id", id).maybeSingle();
  if (readError || !row) return NextResponse.json({ error: "Review not found." }, { status: 404 });
  const pathway = pathwayBySlug(row.pathway_slug);
  if (!pathway || pathway.steps[row.step_index]?.reference !== row.scripture_reference) {
    return NextResponse.json({ error: "Canonical Scripture reference has changed. Investigate before approval." }, { status: 409 });
  }
  if (row.status === "published") return NextResponse.json({ error: "Published corrections are immutable. Submit another revision." }, { status: 409 });
  if (row.status === "rejected" && input.action === "publish") {
    return NextResponse.json({ error: "Rejected corrections cannot be published." }, { status: 409 });
  }
  const title = input.title || row.proposed_title;
  const explanation = input.explanation || row.proposed_explanation;
  const hook = input.hook || row.proposed_hook;
  if (["approve", "publish"].includes(input.action) && (!title.trim() || !explanation.trim())) {
    return NextResponse.json({ error: "Title and explanation are required to approve a passage." }, { status: 400 });
  }
  if (input.action === "publish" && row.status !== "approved") {
    return NextResponse.json({ error: "Approve the correction before publishing." }, { status: 409 });
  }
  const now = new Date().toISOString();
  // Publishing is a separate, explicit admin action, restricted to an approved correction.
  if (input.action === "publish") {
    const { error: publishError } = await service.from("ekegusii_published_steps").upsert({
      pathway_slug: row.pathway_slug, step_index: row.step_index,
      title, explanation, hook,
      correction_id: row.id, published_by: permission.access.user.id, published_at: now,
    }, { onConflict: "pathway_slug,step_index" });
    if (publishError) return NextResponse.json({ error: "Could not publish correction." }, { status: 500 });
  }
  const status = input.action === "save" ? "in_review" :
    input.action === "approve" ? "approved" : input.action === "reject" ? "rejected" : "published";
  const { error: writeError } = await service.from("ekegusii_corrections").update({
    status, admin_notes: input.adminNotes,
    edited_title: title, edited_explanation: explanation, edited_hook: hook,
    reviewed_by: permission.access.user.id, reviewed_at: now,
    published_at: input.action === "publish" ? now : null,
    updated_at: now,
  }).eq("id", id).eq("status", row.status);
  if (writeError) return NextResponse.json({ error: "Unable to save review state." }, { status: 500 });
  try {
    await recordStudioAudit({
      actorUserId: permission.access.user.id, action: "ekegusii.correction_" + status,
      resourceType: "ekegusii_correction", resourceId: id,
      metadata: { pathway_slug: row.pathway_slug, step_index: row.step_index, status },
    });
  } catch { /* Do not lose a successful publication if a secondary audit write fails. */ }
  return NextResponse.json({ ok: true, status });
}
