import { allPathways } from "@/pathway-catalog";
import { EkegusiiCatalog } from "@/ekegusii-edition";

export default function EkegusiiHome() {
  const pathways = allPathways.map(({ slug, title, summary, collection, level, estimatedMinutes, steps }) => ({
    slug, title, summary, collection, level, estimatedMinutes, stepCount: steps.length,
  }));
  return <EkegusiiCatalog pathways={pathways}/>;
}
