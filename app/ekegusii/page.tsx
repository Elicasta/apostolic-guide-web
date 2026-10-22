import { allPathways } from "@/pathway-catalog";
import { revisedEkegusiiSeed } from "@/ekegusii-language-audit";
import { EkegusiiCatalog } from "@/ekegusii-edition";

export default function EkegusiiHome() {
  const pathways = allPathways.map(({ slug, title, summary, collection, level, estimatedMinutes, steps }) => ({
    slug, title, summary, collection, level, estimatedMinutes, stepCount: steps.length,
    translatedTitle: revisedEkegusiiSeed(slug).title || title,
    translatedSummary: revisedEkegusiiSeed(slug).summary || summary,
  }));
  return <EkegusiiCatalog pathways={pathways}/>;
}
