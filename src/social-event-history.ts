import { createServiceClient } from "./supabase";

export type SocialEventHistoryRow = {
  id: number;
  automation_id: string | null;
  trigger_type: "dm_keyword" | "comment_keyword";
  matched_keyword: string | null;
  delivery_status: string;
  source_media_id: string | null;
  event_at: string;
  error_code: string | null;
  retry_recovered: boolean;
};

export async function listSocialEventHistory(limit = 20): Promise<SocialEventHistoryRow[]> {
  const service = createServiceClient();
  if (!service) return [];
  const fetchLimit = Math.max(limit * 8, 80);
  const { data, error } = await service.from("social_events")
    .select("id,external_event_id,automation_id,trigger_type,matched_keyword,delivery_status,source_media_id,event_at,error_code")
    .order("event_at", { ascending: false })
    .limit(fetchLimit);
  if (error) {
    console.error("Could not load social event history", error);
    return [];
  }

  const rows = data ?? [];
  const recovered = new Set<string>();
  for (const row of rows) {
    const externalId = String(row.external_event_id ?? "");
    const marker = externalId.indexOf(":retry:");
    if (marker > -1 && row.delivery_status === "sent") recovered.add(externalId.slice(0, marker));
  }

  return rows
    .filter((row) => !String(row.external_event_id ?? "").includes(":retry:"))
    .slice(0, limit)
    .map((row) => ({
      id: Number(row.id),
      automation_id: typeof row.automation_id === "string" ? row.automation_id : null,
      trigger_type: row.trigger_type as "dm_keyword" | "comment_keyword",
      matched_keyword: typeof row.matched_keyword === "string" ? row.matched_keyword : null,
      delivery_status: String(row.delivery_status),
      source_media_id: typeof row.source_media_id === "string" ? row.source_media_id : null,
      event_at: String(row.event_at),
      error_code: typeof row.error_code === "string" ? row.error_code : null,
      retry_recovered: recovered.has(String(row.external_event_id ?? ""))
    }));
}
