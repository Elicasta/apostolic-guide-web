import { allPathways } from "@/pathway-catalog";
import { ekegusiiSeedDrafts } from "@/ekegusii-seed-drafts";
import { EkegusiiCatalog } from "@/ekegusii-edition";

export default function EkegusiiHome() {
  const pathways = allPathways.map(({ slug, title, summary, collection, level, estimatedMinutes, steps }) => ({
    slug, title, summary, collection, level, estimatedMinutes, stepCount: steps.length,
    translatedTitle: ekegusiiSeedDrafts[slug]?.title || title,
    translatedSummary: ekegusiiSeedDrafts[slug]?.summary || summary,
  }));
  return <EkegusiiCatalog pathways={pathways}/>;
}
