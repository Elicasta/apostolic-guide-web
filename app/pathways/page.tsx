import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Clock3 } from "lucide-react";
import { PageHero } from "@/components";
import { pathways, topicBySlug } from "@/data";

export const metadata: Metadata = { title: "Pathways", description: "Follow guided Scripture pathways through core apostolic doctrines and questions." };

export default function PathwaysPage() {
  return <><PageHero eyebrow="Guided study" title="Follow the biblical pathway." text="Move through a doctrine in sequence. Each step gives you the passage, what it establishes, and why it belongs in the argument." /><section className="section"><div className="shell pathway-grid">{pathways.map((pathway, index) => { const topic = topicBySlug(pathway.topicSlug); return <Link className="pathway-card" href={`/pathways/${pathway.slug}`} key={pathway.slug}><span className="pathway-number">0{index + 1}</span><span className="eyebrow">{topic?.title ?? "Study pathway"}</span><h2>{pathway.title}</h2><p>{pathway.summary}</p><div className="pathway-meta"><span><Clock3 size={13} /> {pathway.estimatedMinutes} min</span><span>{pathway.level}</span><span>{pathway.steps.length} steps</span></div><span className="text-link">Begin pathway <ArrowRight size={16} /></span></Link>; })}</div></section></>;
}
