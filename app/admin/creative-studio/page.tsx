import { redirect } from "next/navigation";
import { getStudioPermission } from "@/auth";
import { CreativeStudioClient } from "@/creative-studio-client";
import { CreativeTemplateSystem } from "@/creative-template-system";
import { allPathways } from "@/pathway-catalog";

export default async function AdminCreativeStudioPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed") redirect("/admin");
  const query = await searchParams;
  const pathways = allPathways.map((pathway) => ({
    slug: pathway.slug,
    title: pathway.title,
    collection: pathway.collection,
    summary: pathway.summary,
    steps: pathway.steps.map((step) => ({ reference: step.reference, title: step.title, explanation: step.explanation }))
  }));
  return <>
    <CreativeStudioClient pathways={pathways} initialProjectId={query.project ?? null} aiReady={Boolean(process.env.OPENAI_API_KEY?.trim())}/>
    <CreativeTemplateSystem projectId={query.project ?? null}/>
  </>;
}
