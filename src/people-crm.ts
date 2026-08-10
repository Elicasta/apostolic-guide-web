import { createServiceClient } from "./supabase";

export type PersonStatus = "lead" | "subscriber" | "app_user" | "inactive" | "archived";

export type Person = {
  id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  instagram_user_id: string | null;
  instagram_username: string | null;
  phone: string | null;
  status: PersonStatus;
  source: string;
  source_detail: string | null;
  first_seen_at: string;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
};

export type PersonEvent = {
  id: number;
  person_id: string;
  event_type: string;
  channel: string;
  event_name: string | null;
  automation_id: string | null;
  external_event_id: string | null;
  metadata: Record<string, unknown>;
  occurred_at: string;
};

export function personLabel(person: Pick<Person, "display_name" | "instagram_username" | "email" | "instagram_user_id">) {
  if (person.display_name?.trim()) return person.display_name.trim();
  if (person.instagram_username?.trim()) return `@${person.instagram_username.trim().replace(/^@/, "")}`;
  if (person.email?.trim()) return person.email.trim();
  if (person.instagram_user_id) return `Instagram · ${person.instagram_user_id.slice(-6)}`;
  return "Unknown person";
}

async function upsertIdentity(input: { personId: string; provider: "instagram" | "email" | "app" | "phone"; providerUserId: string; username?: string | null; email?: string | null; verifiedAt?: string | null }) {
  const service = createServiceClient();
  if (!service) return;
  await service.from("person_identities").upsert({
    person_id: input.personId,
    provider: input.provider,
    provider_user_id: input.providerUserId,
    username: input.username ?? null,
    email: input.email ?? null,
    is_primary: true,
    verified_at: input.verifiedAt ?? null,
    updated_at: new Date().toISOString()
  }, { onConflict: "provider,provider_user_id" });
}

export async function upsertInstagramPerson(input: { instagramUserId: string | null; username?: string | null; sourceDetail?: string | null; seenAt?: string; }) {
  if (!input.instagramUserId) return null;
  const service = createServiceClient();
  if (!service) return null;
  const now = input.seenAt ?? new Date().toISOString();
  const identity = await service.from("person_identities").select("person_id").eq("provider", "instagram").eq("provider_user_id", input.instagramUserId).maybeSingle();
  const existing = identity.data?.person_id
    ? await service.from("people").select("*").eq("id", identity.data.person_id).maybeSingle()
    : await service.from("people").select("*").eq("instagram_user_id", input.instagramUserId).maybeSingle();

  if (existing.data) {
    const updates: Record<string, unknown> = { last_seen_at: now, updated_at: now, instagram_user_id: input.instagramUserId };
    if (input.username) {
      const username = input.username.replace(/^@/, "");
      updates.instagram_username = username;
      if (!existing.data.display_name || String(existing.data.display_name).startsWith("Instagram ·")) updates.display_name = `@${username}`;
    }
    const result = await service.from("people").update(updates).eq("id", existing.data.id).select("*").single();
    const person = (result.data ?? existing.data) as Person;
    await upsertIdentity({ personId: person.id, provider: "instagram", providerUserId: input.instagramUserId, username: input.username?.replace(/^@/, "") ?? null, verifiedAt: now });
    return person;
  }

  const username = input.username?.replace(/^@/, "") || null;
  const result = await service.from("people").insert({
    instagram_user_id: input.instagramUserId,
    instagram_username: username,
    display_name: username ? `@${username}` : null,
    source: "instagram",
    source_detail: input.sourceDetail ?? null,
    first_seen_at: now,
    last_seen_at: now,
    updated_at: now
  }).select("*").single();
  const person = (result.data ?? null) as Person | null;
  if (person) await upsertIdentity({ personId: person.id, provider: "instagram", providerUserId: input.instagramUserId, username, verifiedAt: now });
  return person;
}

export async function recordPersonEvent(input: { personId: string; eventType: string; channel: string; eventName?: string | null; automationId?: string | null; externalEventId?: string | null; metadata?: Record<string, unknown>; occurredAt?: string; }) {
  const service = createServiceClient();
  if (!service) return;
  await service.from("person_events").upsert({
    person_id: input.personId,
    event_type: input.eventType,
    channel: input.channel,
    event_name: input.eventName ?? null,
    automation_id: input.automationId ?? null,
    external_event_id: input.externalEventId ?? null,
    metadata: input.metadata ?? {},
    occurred_at: input.occurredAt ?? new Date().toISOString()
  }, { onConflict: "external_event_id", ignoreDuplicates: true });
}

export async function ingestInstagramPeople(payload: unknown) {
  if (!payload || typeof payload !== "object") return 0;
  const root = payload as { object?: string; entry?: unknown[] };
  if (root.object !== "instagram" || !Array.isArray(root.entry)) return 0;
  let recorded = 0;
  for (const entryRaw of root.entry) {
    if (!entryRaw || typeof entryRaw !== "object") continue;
    const entry = entryRaw as { messaging?: unknown[]; changes?: unknown[] };
    for (const itemRaw of Array.isArray(entry.messaging) ? entry.messaging : []) {
      if (!itemRaw || typeof itemRaw !== "object") continue;
      const item = itemRaw as { sender?: { id?: string }; timestamp?: number; message?: { mid?: string; text?: string; is_echo?: boolean } };
      if (!item.message?.mid || !item.message.text || item.message.is_echo || !item.sender?.id) continue;
      const at = item.timestamp ? new Date(item.timestamp).toISOString() : new Date().toISOString();
      const person = await upsertInstagramPerson({ instagramUserId: item.sender.id, sourceDetail: "instagram_dm", seenAt: at });
      if (!person) continue;
      await recordPersonEvent({ personId: person.id, eventType: "message", channel: "instagram", eventName: "Instagram DM", externalEventId: `crm:message:${item.message.mid}`, occurredAt: at });
      recorded += 1;
    }
    for (const changeRaw of Array.isArray(entry.changes) ? entry.changes : []) {
      if (!changeRaw || typeof changeRaw !== "object") continue;
      const change = changeRaw as { field?: string; value?: { id?: string; text?: string; from?: { id?: string; username?: string }; media?: { id?: string } } };
      if ((change.field !== "comments" && change.field !== "live_comments") || !change.value?.id || !change.value.text || !change.value.from?.id) continue;
      const person = await upsertInstagramPerson({ instagramUserId: change.value.from.id, username: change.value.from.username ?? null, sourceDetail: "instagram_comment" });
      if (!person) continue;
      await recordPersonEvent({
        personId: person.id,
        eventType: "comment",
        channel: "instagram",
        eventName: change.field === "live_comments" ? "Instagram live comment" : "Instagram comment",
        externalEventId: `crm:comment:${change.value.id}`,
        metadata: change.value.media?.id ? { media_id: change.value.media.id } : {}
      });
      recorded += 1;
    }
  }
  return recorded;
}

export async function listPeople(input: { query?: string; source?: string; status?: string; limit?: number } = {}) {
  const service = createServiceClient();
  if (!service) return [] as Person[];
  let query = service.from("people").select("*").order("last_seen_at", { ascending: false }).limit(input.limit ?? 100);
  if (input.source && input.source !== "all") query = query.eq("source", input.source);
  if (input.status && input.status !== "all") query = query.eq("status", input.status);
  if (input.query?.trim()) {
    const needle = input.query.trim().replace(/[,%()]/g, " ");
    query = query.or(`display_name.ilike.%${needle}%,email.ilike.%${needle}%,instagram_username.ilike.%${needle}%`);
  }
  const { data } = await query;
  return (data ?? []) as Person[];
}

export async function getPeopleMetrics() {
  const service = createServiceClient();
  if (!service) return { total: 0, instagram: 0, subscribers: 0, active7d: 0 };
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [total, instagram, subscribers, active7d] = await Promise.all([
    service.from("people").select("id", { count: "exact", head: true }).neq("status", "archived"),
    service.from("people").select("id", { count: "exact", head: true }).not("instagram_user_id", "is", null).neq("status", "archived"),
    service.from("people").select("id", { count: "exact", head: true }).eq("status", "subscriber"),
    service.from("people").select("id", { count: "exact", head: true }).gte("last_seen_at", weekAgo).neq("status", "archived")
  ]);
  return { total: total.count ?? 0, instagram: instagram.count ?? 0, subscribers: subscribers.count ?? 0, active7d: active7d.count ?? 0 };
}

export async function getPerson(id: string) {
  const service = createServiceClient();
  if (!service) return null;
  const [person, events, tags, notes, identities, journeys] = await Promise.all([
    service.from("people").select("*").eq("id", id).maybeSingle(),
    service.from("person_events").select("*").eq("person_id", id).order("occurred_at", { ascending: false }).limit(100),
    service.from("person_tags").select("tag,created_at").eq("person_id", id).order("created_at", { ascending: false }),
    service.from("person_notes").select("id,note,created_by,created_at,updated_at").eq("person_id", id).order("created_at", { ascending: false }),
    service.from("person_identities").select("provider,provider_user_id,username,email,is_primary,verified_at").eq("person_id", id).order("created_at"),
    service.from("growth_journey_enrollments").select("id,status,current_step_position,next_action_at,started_at,completed_at,updated_at,growth_journeys(id,name,description,status)").eq("person_id", id).order("updated_at", { ascending: false })
  ]);
  if (!person.data) return null;
  return { person: person.data as Person, events: (events.data ?? []) as PersonEvent[], tags: tags.data ?? [], notes: notes.data ?? [], identities: identities.data ?? [], journeys: journeys.data ?? [] };
}

export async function mergePeople(primaryId: string, duplicateId: string) {
  if (primaryId === duplicateId) throw new Error("Choose two different people.");
  const service = createServiceClient();
  if (!service) throw new Error("Supabase service access is not configured.");
  const [primary, duplicate] = await Promise.all([
    service.from("people").select("*").eq("id", primaryId).single(),
    service.from("people").select("*").eq("id", duplicateId).single()
  ]);
  if (!primary.data || !duplicate.data) throw new Error("Person not found.");

  await service.from("person_events").update({ person_id: primaryId }).eq("person_id", duplicateId);
  const duplicateTags = await service.from("person_tags").select("tag").eq("person_id", duplicateId);
  for (const row of duplicateTags.data ?? []) await service.from("person_tags").upsert({ person_id: primaryId, tag: row.tag }, { onConflict: "person_id,tag", ignoreDuplicates: true });
  await service.from("person_notes").update({ person_id: primaryId }).eq("person_id", duplicateId);
  await service.from("growth_journey_enrollments").update({ person_id: primaryId }).eq("person_id", duplicateId);
  await service.from("person_identities").update({ person_id: primaryId, updated_at: new Date().toISOString() }).eq("person_id", duplicateId);

  const merged = {
    email: primary.data.email ?? duplicate.data.email,
    instagram_user_id: primary.data.instagram_user_id ?? duplicate.data.instagram_user_id,
    instagram_username: primary.data.instagram_username ?? duplicate.data.instagram_username,
    phone: primary.data.phone ?? duplicate.data.phone,
    display_name: primary.data.display_name ?? duplicate.data.display_name,
    first_seen_at: new Date(primary.data.first_seen_at) < new Date(duplicate.data.first_seen_at) ? primary.data.first_seen_at : duplicate.data.first_seen_at,
    last_seen_at: new Date(primary.data.last_seen_at) > new Date(duplicate.data.last_seen_at) ? primary.data.last_seen_at : duplicate.data.last_seen_at,
    updated_at: new Date().toISOString()
  };
  await service.from("people").update(merged).eq("id", primaryId);
  await service.from("people").update({ status: "archived", display_name: `Merged into ${primaryId.slice(0, 8)}`, updated_at: new Date().toISOString() }).eq("id", duplicateId);
  return primaryId;
}
