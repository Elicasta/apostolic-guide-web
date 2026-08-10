import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";
import { runJourneyEnrollment } from "@/growth-journeys";
import { recordStudioAudit } from "@/studio-audit";

const stepSchema = z.object({
  name: z.string().trim().min(1).max(120),
  stepType: z.enum(["wait","add_tag","remove_tag","set_status","mark_complete","manual_task"]),
  config: z.record(z.string(), z.unknown()).default({})
});

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), name: z.string().trim().min(2).max(140), description: z.string().trim().max(1000).optional(), triggerType: z.enum(["manual","instagram_comment_keyword","instagram_dm_keyword","person_tag"]), triggerConfig: z.record(z.string(), z.unknown()).default({}) }),
  z.object({ action: z.literal("update"), id: z.string().uuid(), name: z.string().trim().min(2).max(140), description: z.string().trim().max(1000).optional(), status: z.enum(["draft","active","paused","archived"]), triggerType: z.enum(["manual","instagram_comment_keyword","instagram_dm_keyword","person_tag"]), triggerConfig: z.record(z.string(), z.unknown()).default({}), steps: z.array(stepSchema).max(30) }),
  z.object({ action: z.literal("enroll"), journeyId: z.string().uuid(), personId: z.string().uuid() }),
  z.object({ action: z.literal("resume"), enrollmentId: z.string().uuid() }),
  z.object({ action: z.literal("cancel"), enrollmentId: z.string().uuid() })
]);

export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_journeys");
  if (!allowed || access.state !== "allowed" || !access.user?.email) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });
  const body = parsed.data;

  if (body.action === "create") {
    const { data, error } = await service.from("growth_journeys").insert({ name: body.name, description: body.description || null, trigger_type: body.triggerType, trigger_config: body.triggerConfig, status: "draft", created_by: access.user.email }).select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await recordStudioAudit({ actorUserId: access.user.id, action: "journey.created", resourceType: "journey", resourceId: data.id, metadata: { name: body.name, trigger_type: body.triggerType, status: "draft" } });
    return NextResponse.json({ ok: true, id: data.id });
  }

  if (body.action === "update") {
    const now = new Date().toISOString();
    const { error } = await service.from("growth_journeys").update({ name: body.name, description: body.description || null, status: body.status, trigger_type: body.triggerType, trigger_config: body.triggerConfig, updated_at: now }).eq("id", body.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await service.from("growth_journey_steps").delete().eq("journey_id", body.id);
    if (body.steps.length) {
      const rows = body.steps.map((step, position) => ({ journey_id: body.id, position, name: step.name, step_type: step.stepType, config: step.config, updated_at: now }));
      const inserted = await service.from("growth_journey_steps").insert(rows);
      if (inserted.error) return NextResponse.json({ error: inserted.error.message }, { status: 500 });
    }
    await recordStudioAudit({ actorUserId: access.user.id, action: "journey.updated", resourceType: "journey", resourceId: body.id, metadata: { name: body.name, trigger_type: body.triggerType, status: body.status, step_count: body.steps.length } });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "enroll") {
    const existing = await service.from("growth_journey_enrollments").select("id").eq("journey_id", body.journeyId).eq("person_id", body.personId).in("status", ["active","waiting","paused"]).maybeSingle();
    let enrollmentId = existing.data?.id as string | undefined;
    let createdEnrollment = false;
    if (!enrollmentId) {
      const created = await service.from("growth_journey_enrollments").insert({ journey_id: body.journeyId, person_id: body.personId, status: "active", current_step_position: 0, context: { trigger_type: "manual" } }).select("id").single();
      if (created.error) return NextResponse.json({ error: created.error.message }, { status: 500 });
      enrollmentId = String(created.data.id);
      createdEnrollment = true;
      await service.from("growth_journey_events").insert({ enrollment_id: enrollmentId, person_id: body.personId, journey_id: body.journeyId, event_type: "enrolled", step_position: 0, detail: { trigger_type: "manual" } });
    }
    await runJourneyEnrollment(enrollmentId);
    await recordStudioAudit({ actorUserId: access.user.id, action: createdEnrollment ? "journey.person_enrolled" : "journey.enrollment_ran", resourceType: "journey_enrollment", resourceId: enrollmentId, metadata: { journey_id: body.journeyId, person_id: body.personId } });
    return NextResponse.json({ ok: true, enrollmentId });
  }

  if (body.action === "resume") {
    const enrollment = await service.from("growth_journey_enrollments").select("id,status,current_step_position").eq("id", body.enrollmentId).maybeSingle();
    if (!enrollment.data) return NextResponse.json({ error: "Enrollment not found." }, { status: 404 });
    const nextPosition = enrollment.data.status === "paused" ? Number(enrollment.data.current_step_position) + 1 : Number(enrollment.data.current_step_position);
    await service.from("growth_journey_enrollments").update({ status: "active", current_step_position: nextPosition, next_action_at: null, updated_at: new Date().toISOString() }).eq("id", body.enrollmentId);
    await runJourneyEnrollment(body.enrollmentId);
    await recordStudioAudit({ actorUserId: access.user.id, action: "journey.enrollment_resumed", resourceType: "journey_enrollment", resourceId: body.enrollmentId, metadata: { step_position: nextPosition } });
    return NextResponse.json({ ok: true });
  }

  await service.from("growth_journey_enrollments").update({ status: "cancelled", next_action_at: null, updated_at: new Date().toISOString() }).eq("id", body.enrollmentId);
  await recordStudioAudit({ actorUserId: access.user.id, action: "journey.enrollment_cancelled", resourceType: "journey_enrollment", resourceId: body.enrollmentId });
  return NextResponse.json({ ok: true });
}
