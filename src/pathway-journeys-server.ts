import "server-only";
import { createServiceClient } from "./supabase";
import { buildPathwayJourneys, type JourneyEvent } from "./pathway-journeys";

const EVENT_NAMES = [
  "page_viewed","pathway_started","pathway_step_viewed",
  "pathway_step_completed","pathway_step_navigated",
  "pathway_entry_clicked","pathway_completed"
];
export async function loadPathwayJourneys(days = 30) {
  const client = createServiceClient();
  if (!client) return { snapshot: null, error: "Analytics database is not configured.", truncated: false };
  const safeDays = Math.min(90,Math.max(7,Math.floor(days)));
  const since = new Date(Date.now() - safeDays*86_400_000).toISOString();
  const events: JourneyEvent[] = [];
  let truncated = false;
  for(let page=0;page<10;page++){
    const from=page*1000;
    const {data,error}=await client.schema("analytics").from("events")
      .select("event_name,session_id,occurred_at,page_path,referrer_host,utm_source,properties")
      .in("event_name",EVENT_NAMES)
      .gte("occurred_at",since)
      .order("occurred_at",{ascending:true})
      .range(from,from+999);
    if(error) return { snapshot:null,error:error.message,truncated:false };
    const batch=(data??[]) as JourneyEvent[];
    events.push(...batch);
    if(batch.length<1000)break;
    if(page===9)truncated=true;
  }
  return {snapshot:buildPathwayJourneys(events,safeDays),error:null,truncated};
}
