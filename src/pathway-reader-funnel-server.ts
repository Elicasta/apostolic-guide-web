import "server-only";
import { createServiceClient } from "./supabase";
import { allPathways } from "./pathway-catalog";
import {
  buildPathwayReaderFunnels,
  PATHWAY_READER_LEDGER,
  type PathwayReaderEvent
} from "./pathway-reader-funnel";

const PAGE_SIZE = PATHWAY_READER_LEDGER.pageSize;
const MAX_PAGES = PATHWAY_READER_LEDGER.maxPages;

export async function loadPathwayReaderFunnels({ days = 30 }: { days?: number } = {}) {
  const service = createServiceClient();
  if (!service) {
    return {
      rows: [],
      error: "Supabase service access is not configured.",
      truncated: false,
      days
    };
  }

  const safeDays = Math.min(90, Math.max(7, Math.floor(days)));
  const since = new Date(Date.now() - safeDays * 86_400_000).toISOString();
  const analytics = service.schema("analytics");
  const events: PathwayReaderEvent[] = [];
  let truncated = false;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const result = await analytics
      .from("events")
      .select(PATHWAY_READER_LEDGER.columns)
      .in("event_name", [...PATHWAY_READER_LEDGER.eventNames])
      .gte("occurred_at", since)
      .order("occurred_at", { ascending: true })
      .range(from, to);

    if (result.error) {
      return {
        rows: [],
        error: result.error.message,
        truncated: false,
        days: safeDays
      };
    }

    const batch = (result.data ?? []) as PathwayReaderEvent[];
    events.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    if (page === MAX_PAGES - 1) truncated = true;
  }

  const catalog = allPathways.map((pathway) => ({
    slug: pathway.slug,
    title: pathway.title,
    steps: pathway.steps.map((step) => ({ title: step.title, reference: step.reference }))
  }));

  return {
    rows: buildPathwayReaderFunnels(events, catalog),
    error: null as string | null,
    truncated,
    days: safeDays
  };
}
