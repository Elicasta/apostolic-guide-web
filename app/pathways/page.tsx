import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Clock3, Route } from "lucide-react";
import { AppBridge, PageHero } from "@/components";
import { pathways } from "@/data";

export const metadata: Metadata = {
  title: "Scripture Pathways",
  description: "Follow guided sequences of connected Scriptures through Apostolic doctrine and common questions."
};

export default function PathwaysPage() {
  return (
    <>
      <PageHero variant="pathways" eyebrow="Guided Scripture studies" title="Do not collect isolated verses. Follow the pathway." text="Each pathway establishes the starting point, moves through connected passages, and shows how the biblical argument develops." />
      <section className="section pathways-index-section">
        <div className="shell pathway-grid">
          {pathways.map((pathway, index) => (
            <Link className="pathway-card" href={`/pathways/${pathway.slug}`} key={pathway.slug} data-reveal>
              <span className="pathway-number">{String(index + 1).padStart(2, "0")}</span>
              <Route size={23} />
              <span className="eyebrow">Scripture pathway</span>
              <h2>{pathway.title}</h2>
              <p>{pathway.summary}</p>
              <div className="pathway-meta"><span><Clock3 size={12} /> {pathway.estimatedMinutes} min</span><span>{pathway.steps.length} steps</span><span>{pathway.level}</span></div>
              <span className="text-link">Begin pathway <ArrowRight size={16} /></span>
            </Link>
          ))}
        </div>
      </section>
      <section className="section section-tight"><div className="shell"><AppBridge origin="pathways-index" /></div></section>
    </>
  );
}
