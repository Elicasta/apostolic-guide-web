import { redirect } from "next/navigation";
import { getStudioPermission } from "@/auth";
import { allPathways } from "@/pathway-catalog";
import { PathwayCarouselStudio } from "@/pathway-carousel-studio";

export default async function AdminCarouselStudioPage() {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed") redirect("/admin");

  const pathways = allPathways.map((pathway) => ({
    slug: pathway.slug,
    title: pathway.title,
    summary: pathway.summary,
    collection: pathway.collection,
    steps: pathway.steps.map((step) => ({
      title: step.title,
      reference: step.reference,
      explanation: step.explanation
    }))
  }));

  return <PathwayCarouselStudio pathways={pathways} aiReady={Boolean(process.env.OPENAI_API_KEY?.trim())}/>;
}
