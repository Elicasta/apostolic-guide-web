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

export async function upsertInstagramPerson(input: { instagramUserId: string | null; username?: string | null; sourceDetail?: string | null; seenAt?: string; }) {
  if (!input.instagramUserId) return null;
  const service = createServiceClient();
  if (!service) return null;
  const now = input.seenAt ?? new Date().toISOString();
  const existing = await service.from("people").select("*").eq("instagram_user_id", input.instagramUserId).maybeSingle();
  if (existing.data) {
    const updates: Record<string, unknown> = { last_seen_at: now, updated_at: now };
    if (input.username) {
      updates.instagram_username = input.username.replace(/^@/, "");
      if (!existing.data.display_name) updates.display_name = `@${input.username.replace(/^@/, "")}`;
    }
    const result = await service.from("people").update(updates).eq("id", existing.data.id).select("*").single();
    return (result.data ?? existing.data) as Person;
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
  return (result.data ?? null) as Person | null;
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
    service.from("people").select("id", { count: "exact", head: true }).eq("source", "instagram").neq("status", "archived"),
    service.from("people").select("id", { count: "exact", head: true }).eq("status", "subscriber"),
    service.from("people").select("id", { count: "exact", head: true }).gte("last_seen_at", weekAgo).neq("status", "archived")
  ]);
  return { total: total.count ?? 0, instagram: instagram.count ?? 0, subscribers: subscribers.count ?? 0, active7d: active7d.count ?? 0 };
}

export async function getPerson(id: string) {
  const service = createServiceClient();
  if (!service) return null;
  const [person, events, tags, notes, journeys] = await Promise.all([
    service.from("people").select("*").eq("id", id).maybeSingle(),
    service.from("person_events").select("*").eq("person_id", id).order("occurred_at", { ascending: false }).limit(100),
    service.from("person_tags").select("tag,created_at").eq("person_id", id).order("created_at", { ascending: false }),
    service.from("person_notes").select("id,note,created_by,created_at,updated_at").eq("person_id", id).order("created_at", { ascending: false }),
    service.from("journey_progress").select("*").eq("person_id", id).order("updated_at", { ascending: false })
  ]);
  if (!person.data) return null;
  return { person: person.data as Person, events: (events.data ?? []) as PersonEvent[], tags: tags.data ?? [], notes: notes.data ?? [], journeys: journeys.data ?? [] };
}
