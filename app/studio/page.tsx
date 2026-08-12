import type { Metadata } from "next";
import { allPathways } from "@/pathway-catalog";
import StudioClient from "./studio-client";
import "./studio.css";

export const metadata: Metadata = {
  title: "AG Studio",
  description: "Plan and produce Apostolic Guide episodes from Pathways, Scriptures, live questions, polls, and media."
};

export default function StudioPage() {
  const pathways = allPathways.map((pathway) => ({
    slug: pathway.slug,
    title: pathway.title,
    summary: pathway.summary,
    collection: pathway.collection,
    estimatedMinutes: pathway.estimatedMinutes,
    level: pathway.level,
    steps: pathway.steps.map((step) => ({
      title: step.title,
      reference: step.reference,
      explanation: step.explanation
    }))
  }));

  return <StudioClient pathways={pathways} />;
}
