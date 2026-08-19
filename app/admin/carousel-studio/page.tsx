import Link from "next/link";
import { redirect } from "next/navigation";
import { FolderOpen, Layers3 } from "lucide-react";
import { getStudioPermission } from "@/auth";
import { CarouselFreshPublishGuard } from "@/carousel-fresh-publish-guard";
import { CarouselLiveRepair } from "@/carousel-live-repair";
import { CarouselManualEdit } from "@/carousel-manual-edit";
import { CarouselMobileInteractions } from "@/carousel-mobile-interactions";
import { CarouselPersistentArtwork } from "@/carousel-persistent-artwork";
import { CarouselProjectDelete } from "@/carousel-project-delete";
import { CarouselProjectStarter } from "@/carousel-project-starter";
import { CarouselSingleArtDirector } from "@/carousel-single-art-director";
import { CarouselStudioMobileFocus } from "@/carousel-studio-mobile-focus";
import { CreativeLibraryClient } from "@/creative-library-client";
import { CreativeStudioClient } from "@/creative-studio-client";
import { CreativeTemplateSystem } from "@/creative-template-system";
import { allPathways } from "@/pathway-catalog";

export default async function AdminCarouselStudioPage({ searchParams }: { searchParams: Promise<{ project?: string; view?: string }> }) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed") redirect("/admin");
  const query = await searchParams;
  const projectId = query.project ?? null;
  const libraryView = query.view === "library" && !projectId;
  const pathways = allPathways.map((pathway) => ({
    slug: pathway.slug,
    title: pathway.title,
    collection: pathway.collection,
    summary: pathway.summary,
    steps: pathway.steps.map((step) => ({ reference: step.reference, title: step.title, explanation: step.explanation }))
  }));
  const aiReady = Boolean(process.env.OPENAI_API_KEY?.trim());

  return <section className="creative-hub-shell carousel-studio-master">
    <div className="creative-hub-switch" aria-label="Carousel Studio views">
      <Link className={!libraryView ? "is-active" : ""} href="/admin/carousel-studio"><Layers3 size={16}/><span><strong>Create / Edit</strong><small>Single · Carousel · Story</small></span></Link>
      <Link className={libraryView ? "is-active" : ""} href="/admin/carousel-studio?view=library"><FolderOpen size={16}/><span><strong>Library</strong><small>Drafts · Ready · Published</small></span></Link>
    </div>
    {libraryView ? <CreativeLibraryClient/> : <>
      {!projectId ? <CarouselProjectStarter pathways={pathways} aiReady={aiReady}/> : null}
      <CreativeStudioClient pathways={pathways} initialProjectId={projectId} aiReady={aiReady}/>
      {projectId ? <CarouselFreshPublishGuard projectId={projectId}/> : null}
      {projectId ? <CarouselManualEdit projectId={projectId}/> : null}
      <CreativeTemplateSystem projectId={projectId}/>
      {projectId ? <CarouselPersistentArtwork/> : null}
      {projectId ? <CarouselSingleArtDirector projectId={projectId}/> : null}
      {projectId ? <CarouselProjectDelete/> : null}
      {projectId ? <CarouselStudioMobileFocus/> : null}
      {projectId ? <CarouselLiveRepair/> : null}
      {projectId ? <CarouselMobileInteractions/> : null}
    </>}
  </section>;
}
