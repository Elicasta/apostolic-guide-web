import { notFound, redirect } from "next/navigation";
import { getAdminAccess } from "@/auth";
import { allPathways } from "@/pathway-catalog";
import { getEpisode } from "@/studio/repository";
import EpisodeWorkspace from "./episode-workspace";
import "../../studio.css";
import "./run-editor.css";

export const dynamic = "force-dynamic";

export default async function StudioEpisodePage({ params }: { params: Promise<{ episodeId: string }> }) {
  const access = await getAdminAccess();
  if (access.state === "signed_out") redirect("/login");
  if (access.state !== "allowed" || !["owner", "admin", "editor"].includes(access.role ?? "")) redirect("/");
  const { episodeId } = await params;
  const data = await getEpisode(episodeId).catch(() => null);
  if (!data) notFound();
  const primaryId = data.pathways.find((item) => item.is_primary)?.pathway_id;
  const pathway = allPathways.find((item) => item.slug === primaryId) ?? allPathways[0];
  return <EpisodeWorkspace data={data as never} pathway={{ slug: pathway.slug, title: pathway.title, summary: pathway.summary, steps: pathway.steps }} />;
}
