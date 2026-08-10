import { createServiceClient } from "./supabase";

export type StudioNotification = {
  id: number;
  type: string;
  severity: "info" | "success" | "warning" | "error";
  title: string;
  detail: string | null;
  href: string | null;
  person_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  read_at: string | null;
  created_at: string;
};

export async function getNotificationUnreadCount() {
  const service = createServiceClient();
  if (!service) return 0;
  const { count } = await service.from("studio_notifications").select("id", { count: "exact", head: true }).is("read_at", null);
  return count ?? 0;
}

export async function listStudioNotifications(input: { unreadOnly?: boolean; limit?: number } = {}) {
  const service = createServiceClient();
  if (!service) return [] as StudioNotification[];
  let query = service.from("studio_notifications").select("*").order("created_at", { ascending: false }).limit(input.limit ?? 100);
  if (input.unreadOnly) query = query.is("read_at", null);
  const { data } = await query;
  return (data ?? []) as StudioNotification[];
}

export async function markStudioNotificationRead(id: number) {
  const service = createServiceClient();
  if (!service) throw new Error("Supabase service access is not configured.");
  const { error } = await service.from("studio_notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function markAllStudioNotificationsRead() {
  const service = createServiceClient();
  if (!service) throw new Error("Supabase service access is not configured.");
  const { error } = await service.from("studio_notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
  if (error) throw new Error(error.message);
}
