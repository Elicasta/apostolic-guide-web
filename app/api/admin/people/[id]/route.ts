import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";
import { enrollPersonInJourney } from "@/growth-journeys";
import { enrollJourneysForTag } from "@/journey-triggers";
import { mergePeople } from "@/people-crm";

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status"), status: z.enum(["lead","subscriber","app_user","inactive","archived"]) }),
  z.object({ action: z.literal("add_tag"), tag: z.string().trim().min(1).max(80) }),
  z.object({ action: z.literal("remove_tag"), tag: z.string().trim().min(1).max(80) }),
  z.object({ action: z.literal("add_note"), note: z.string().trim().min(1).max(4000) }),
  z.object({ action: z.literal("enroll_journey"), journeyId: z.string().uuid() }),
  z.object({ action: z.literal("merge_into_here"), duplicateId: z.string().uuid() })
]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { access, allowed } = await getStudioPermission("manage_people");
  if (!allowed || access.state !== "allowed" || !access.user?.email) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid person id." }, { status: 400 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });
  const body = parsed.data;

  if (body.action === "status") {
    const { error } = await service.from("people").update({ status: body.status, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else if (body.action === "add_tag") {
    const { error } = await service.from("person_tags").upsert({ person_id: id, tag: body.tag }, { onConflict: "person_id,tag", ignoreDuplicates: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await enrollJourneysForTag(id, body.tag);
  } else if (body.action === "remove_tag") {
    const { error } = await service.from("person_tags").delete().eq("person_id", id).eq("tag", body.tag);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else if (body.action === "add_note") {
    const { error } = await service.from("person_notes").insert({ person_id: id, note: body.note, created_by: access.user.email });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else if (body.action === "enroll_journey") {
    const enrollmentId = await enrollPersonInJourney({ journeyId: body.journeyId, personId: id, context: { trigger_type: "manual", enrolled_by: access.user.email } });
    if (!enrollmentId) return NextResponse.json({ error: "Could not enroll person." }, { status: 500 });
  } else {
    await mergePeople(id, body.duplicateId);
  }

  return NextResponse.json({ ok: true });
}
