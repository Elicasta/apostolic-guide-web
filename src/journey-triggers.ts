import { createServiceClient } from "./supabase";
import { enrollPersonInJourney } from "./growth-journeys";

export async function enrollJourneysForTag(personId: string, tag: string) {
  const service = createServiceClient();
  if (!service) return 0;
  const { data } = await service.from("growth_journeys").select("id,trigger_config").eq("status", "active").eq("trigger_type", "person_tag");
  let count = 0;
  for (const journey of data ?? []) {
    const config = (journey.trigger_config ?? {}) as Record<string, unknown>;
    const keywords = Array.isArray(config.keywords) ? config.keywords.map((v) => String(v).trim().toLowerCase()) : [];
    if (keywords.length && !keywords.includes(tag.trim().toLowerCase())) continue;
    const id = await enrollPersonInJourney({ journeyId: String(journey.id), personId, context: { trigger_type: "person_tag", tag } });
    if (id) count += 1;
  }
  return count;
}
