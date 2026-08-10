import { createServiceClient } from "./supabase";
import type { PersonStatus } from "./people-crm";

export type JourneyTriggerType = "manual" | "instagram_comment_keyword" | "instagram_dm_keyword" | "person_tag";
export type JourneyStatus = "draft" | "active" | "paused" | "archived";
export type JourneyStepType = "wait" | "add_tag" | "remove_tag" | "set_status" | "mark_complete" | "manual_task";

export type GrowthJourney = {
  id: string;
  name: string;
  description: string | null;
  status: JourneyStatus;
  trigger_type: JourneyTriggerType;
  trigger_config: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type GrowthJourneyStep = {
  id: string;
  journey_id: string;
  position: number;
  name: string;
  step_type: JourneyStepType;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export async function listJourneys() {
  const service = createServiceClient();
  if (!service) return [] as Array<GrowthJourney & { steps: GrowthJourneyStep[]; enrollment_count: number }>;
  const [journeys, steps, enrollments] = await Promise.all([
    service.from("growth_journeys").select("*").order("updated_at", { ascending: false }),
    service.from("growth_journey_steps").select("*").order("position"),
    service.from("growth_journey_enrollments").select("journey_id,status")
  ]);
  return (journeys.data ?? []).map((journey) => ({
    ...(journey as GrowthJourney),
    steps: (steps.data ?? []).filter((step) => step.journey_id === journey.id) as GrowthJourneyStep[],
    enrollment_count: (enrollments.data ?? []).filter((row) => row.journey_id === journey.id && ["active","waiting","paused"].includes(row.status)).length
  }));
}

export async function getJourney(id: string) {
  const service = createServiceClient();
  if (!service) return null;
  const [journey, steps, enrollments] = await Promise.all([
    service.from("growth_journeys").select("*").eq("id", id).maybeSingle(),
    service.from("growth_journey_steps").select("*").eq("journey_id", id).order("position"),
    service.from("growth_journey_enrollments").select("*,people(id,display_name,instagram_username,email)").eq("journey_id", id).order("updated_at", { ascending: false }).limit(100)
  ]);
  if (!journey.data) return null;
  return { journey: journey.data as GrowthJourney, steps: (steps.data ?? []) as GrowthJourneyStep[], enrollments: enrollments.data ?? [] };
}

function keywordMatch(message: string, keyword: string, mode: string) {
  const text = message.trim().toLowerCase();
  const needle = keyword.trim().toLowerCase();
  if (!needle || !text) return false;
  if (mode === "exact") return text === needle;
  if (mode === "starts_with") return text.startsWith(needle);
  return text.includes(needle);
}

export async function enrollMatchingJourneys(input: {
  personId: string;
  triggerType: "comment_keyword" | "dm_keyword";
  text: string;
  matchedKeyword?: string | null;
  sourceEventId?: string | null;
}) {
  const service = createServiceClient();
  if (!service) return [] as string[];
  const wanted: JourneyTriggerType = input.triggerType === "comment_keyword" ? "instagram_comment_keyword" : "instagram_dm_keyword";
  const { data: journeys } = await service.from("growth_journeys").select("*").eq("status", "active").eq("trigger_type", wanted);
  const enrolled: string[] = [];
  for (const raw of journeys ?? []) {
    const journey = raw as GrowthJourney;
    const config = journey.trigger_config ?? {};
    const keywords = Array.isArray(config.keywords) ? config.keywords.map(String) : [];
    const mode = typeof config.match_type === "string" ? config.match_type : "contains";
    const matches = keywords.length === 0 || keywords.some((keyword) => keywordMatch(input.text, keyword, mode));
    if (!matches) continue;
    const id = await enrollPersonInJourney({ journeyId: journey.id, personId: input.personId, context: { trigger_type: input.triggerType, matched_keyword: input.matchedKeyword ?? null, source_event_id: input.sourceEventId ?? null } });
    if (id) enrolled.push(id);
  }
  return enrolled;
}

export async function enrollPersonInJourney(input: { journeyId: string; personId: string; context?: Record<string, unknown> }) {
  const service = createServiceClient();
  if (!service) return null;
  const existing = await service.from("growth_journey_enrollments").select("id,status").eq("journey_id", input.journeyId).eq("person_id", input.personId).in("status", ["active","waiting","paused"]).maybeSingle();
  if (existing.data) return existing.data.id as string;
  const result = await service.from("growth_journey_enrollments").insert({ journey_id: input.journeyId, person_id: input.personId, status: "active", current_step_position: 0, context: input.context ?? {} }).select("id").single();
  if (!result.data?.id) return null;
  await service.from("growth_journey_events").insert({ enrollment_id: result.data.id, journey_id: input.journeyId, person_id: input.personId, event_type: "enrolled", step_position: 0, detail: input.context ?? {} });
  await runJourneyEnrollment(String(result.data.id));
  return String(result.data.id);
}

export async function runJourneyEnrollment(enrollmentId: string) {
  const service = createServiceClient();
  if (!service) return;
  const enrollmentResult = await service.from("growth_journey_enrollments").select("*").eq("id", enrollmentId).maybeSingle();
  const enrollment = enrollmentResult.data;
  if (!enrollment || !["active","waiting"].includes(enrollment.status)) return;
  if (enrollment.status === "waiting" && enrollment.next_action_at && new Date(enrollment.next_action_at).getTime() > Date.now()) return;

  const { data: steps } = await service.from("growth_journey_steps").select("*").eq("journey_id", enrollment.journey_id).order("position");
  const ordered = (steps ?? []) as GrowthJourneyStep[];
  let position = Number(enrollment.current_step_position ?? 0);

  while (position < ordered.length) {
    const step = ordered[position];
    if (step.step_type === "wait") {
      const minutes = Math.max(1, Number(step.config.minutes ?? 60));
      const next = new Date(Date.now() + minutes * 60_000).toISOString();
      await service.from("growth_journey_enrollments").update({ status: "waiting", current_step_position: position + 1, next_action_at: next, updated_at: new Date().toISOString() }).eq("id", enrollmentId);
      await service.from("growth_journey_events").insert({ enrollment_id: enrollmentId, person_id: enrollment.person_id, journey_id: enrollment.journey_id, event_type: "waiting", step_position: position, detail: { minutes } });
      return;
    }

    if (step.step_type === "manual_task") {
      await service.from("growth_journey_enrollments").update({ status: "paused", current_step_position: position, next_action_at: null, updated_at: new Date().toISOString() }).eq("id", enrollmentId);
      await service.from("growth_journey_events").insert({ enrollment_id: enrollmentId, person_id: enrollment.person_id, journey_id: enrollment.journey_id, event_type: "manual_task", step_position: position, detail: { instruction: step.config.instruction ?? step.name } });
      return;
    }

    if (step.step_type === "add_tag") {
      const tag = String(step.config.tag ?? "").trim();
      if (tag) await service.from("person_tags").upsert({ person_id: enrollment.person_id, tag }, { onConflict: "person_id,tag", ignoreDuplicates: true });
    } else if (step.step_type === "remove_tag") {
      const tag = String(step.config.tag ?? "").trim();
      if (tag) await service.from("person_tags").delete().eq("person_id", enrollment.person_id).eq("tag", tag);
    } else if (step.step_type === "set_status") {
      const status = String(step.config.status ?? "lead") as PersonStatus;
      if (["lead","subscriber","app_user","inactive","archived"].includes(status)) await service.from("people").update({ status, updated_at: new Date().toISOString() }).eq("id", enrollment.person_id);
    } else if (step.step_type === "mark_complete") {
      await service.from("growth_journey_enrollments").update({ status: "completed", current_step_position: position + 1, completed_at: new Date().toISOString(), next_action_at: null, updated_at: new Date().toISOString() }).eq("id", enrollmentId);
      await service.from("growth_journey_events").insert({ enrollment_id: enrollmentId, person_id: enrollment.person_id, journey_id: enrollment.journey_id, event_type: "completed", step_position: position, detail: {} });
      return;
    }

    await service.from("growth_journey_events").insert({ enrollment_id: enrollmentId, person_id: enrollment.person_id, journey_id: enrollment.journey_id, event_type: "step_completed", step_position: position, detail: { step_type: step.step_type, name: step.name } });
    position += 1;
    await service.from("growth_journey_enrollments").update({ status: "active", current_step_position: position, next_action_at: null, updated_at: new Date().toISOString() }).eq("id", enrollmentId);
  }

  await service.from("growth_journey_enrollments").update({ status: "completed", completed_at: new Date().toISOString(), next_action_at: null, updated_at: new Date().toISOString() }).eq("id", enrollmentId);
  await service.from("growth_journey_events").insert({ enrollment_id: enrollmentId, person_id: enrollment.person_id, journey_id: enrollment.journey_id, event_type: "completed", step_position: position, detail: {} });
}

export async function runDueJourneys(limit = 100) {
  const service = createServiceClient();
  if (!service) return 0;
  const { data } = await service.from("growth_journey_enrollments").select("id").eq("status", "waiting").lte("next_action_at", new Date().toISOString()).limit(limit);
  for (const row of data ?? []) await runJourneyEnrollment(String(row.id));
  return data?.length ?? 0;
}
