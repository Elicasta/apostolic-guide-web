import { redirect } from "next/navigation";
import { getStudioPermission } from "@/auth";
import { allPathways } from "@/pathway-catalog";
import { PathwayAssetIngestRoom } from "@/pathway-asset-ingest-room";

export default async function AdminPathwayAssetIngestPage({
  searchParams
}: {
  searchParams: Promise<{ pathway?: string; studio?: string }>;
}) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed") redirect("/admin");
  const query = await searchParams;
  const pathways = allPathways.map((pathway) => ({
    slug: pathway.slug,
    title: pathway.title,
    summary: pathway.summary,
    collection: pathway.collection
  }));
  const initialPathwaySlug = pathways.some((pathway) => pathway.slug === query.pathway)
    ? String(query.pathway)
    : pathways.find((pathway) => pathway.slug === "jesus-is-god")?.slug ?? pathways[0]?.slug ?? "";
  const initialStudio = query.studio === "video" ? "video" : "carousel";
  return <PathwayAssetIngestRoom pathways={pathways} initialPathwaySlug={initialPathwaySlug} initialStudio={initialStudio}/>;
}
