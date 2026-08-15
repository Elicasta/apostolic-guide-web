import { redirect } from "next/navigation";
import { getStudioPermission } from "@/auth";
import { allPathways } from "@/pathway-catalog";
import { PathwayAssetHub } from "@/pathway-asset-hub";

export default async function AdminPathwayAssetsPage() {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed") redirect("/admin");

  const pathways = allPathways.map((pathway) => ({
    slug: pathway.slug,
    title: pathway.title,
    summary: pathway.summary,
    collection: pathway.collection
  }));

  return <PathwayAssetHub pathways={pathways} aiReady={Boolean(process.env.OPENAI_API_KEY?.trim())}/>;
}
