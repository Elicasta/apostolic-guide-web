import Link from "next/link";
import { redirect } from "next/navigation";
import { FolderOpen, Layers3 } from "lucide-react";
import { getStudioPermission } from "@/auth";
import { CarouselWorkflowStages } from "@/carousel-workflow-stages";
import { CreativeLibraryClient } from "@/creative-library-client";
import { CreativeStudioClient } from "@/creative-studio-client";
import { CreativeTemplateSystem } from "@/creative-template-system";
import { allPathways } from "@/pathway-catalog";

export default async function AdminCarouselStudioPage({ searchParams }: { searchParams: Promise<{ project?: string; view?: string }> }) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed") redirect("/admin");
  const query = await searchParams;
  const libraryView = query.view === "library" && !query.project;
  const pathways = allPathways.map((pathway) => ({
    slug: pathway.slug,
    title: pathway.title,
    collection: pathway.collection,
    summary: pathway.summary,
    steps: pathway.steps.map((step) => ({ reference: step.reference, title: step.title, explanation: step.explanation }))
  }));

  return <section className="creative-hub-shell carousel-studio-master">
    <div className="creative-hub-switch" aria-label="Carousel Studio views">
      <Link className={!libraryView ? "is-active" : ""} href="/admin/carousel-studio"><Layers3 size={16}/><span><strong>Create / Edit</strong><small>Single · Carousel · Story</small></span></Link>
      <Link className={libraryView ? "is-active" : ""} href="/admin/carousel-studio?view=library"><FolderOpen size={16}/><span><strong>Library</strong><small>Drafts · Ready · Published</small></span></Link>
    </div>
    {libraryView ? <CreativeLibraryClient/> : <>
      <CreativeStudioClient pathways={pathways} initialProjectId={query.project ?? null} aiReady={Boolean(process.env.OPENAI_API_KEY?.trim())}/>
      <CreativeTemplateSystem projectId={query.project ?? null}/>
      <CarouselWorkflowStages projectId={query.project ?? null}/>
    </>}
  </section>;
}
