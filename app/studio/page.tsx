import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { redirect } from "next/navigation";
import { getAdminAccess } from "@/auth";
import { allPathways } from "@/pathway-catalog";
import { listEpisodes } from "@/studio/repository";
import StudioClient from "./studio-client";
import "./studio.css";

export const metadata: Metadata = {
  title: "AG Broadcast Studio",
  description: "Plan and produce Apostolic Guide episodes from Pathways, Scriptures, live questions, polls, and media."
};

export const dynamic = "force-dynamic";

export default async function StudioPage() {
  const access = await getAdminAccess();
  if (access.state === "signed_out") redirect("/login");
  if (access.state === "forbidden") redirect("/");

  const pathways = allPathways.map((pathway) => ({
    slug: pathway.slug,
    title: pathway.title,
    summary: pathway.summary,
    collection: pathway.collection,
    estimatedMinutes: pathway.estimatedMinutes,
    level: pathway.level,
    steps: pathway.steps.map((step) => ({ title: step.title, reference: step.reference, explanation: step.explanation }))
  }));
  const episodes = await listEpisodes().catch(() => []);

  return <><StudioClient pathways={pathways} episodes={episodes.map((episode) => ({ id: String(episode.id), title: String(episode.title), type: String(episode.episode_type ?? "episode"), status: String(episode.status ?? "draft"), updatedAt: String(episode.updated_at ?? "") }))} /><Link className="ag-studio-floating-new" href="/studio/episodes/new"><Plus size={17}/> New episode</Link></>;
}
