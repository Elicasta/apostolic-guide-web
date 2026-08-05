import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Clock3, Route } from "lucide-react";
import { AppBridge, PageHero } from "@/components";
import { allPathways, pathwayCollections } from "@/pathway-catalog";

export const metadata: Metadata = {
  title: "Scripture Pathways",
  description: "Follow guided sequences of connected Scriptures through Apostolic doctrine and common questions."
};

export default function PathwaysPage() {
  const grouped = pathwayCollections.map((collection) => ({
    ...collection,
    items: allPathways.filter((pathway) => pathway.collection === collection.title)
  }));

  return (
    <>
      <PageHero variant="pathways" eyebrow="Guided Scripture studies" title="Do not collect isolated verses. Follow the pathway." text="Website pathways give you the biblical structure without overwhelming you. Continue in the app for the full sequence, objections, branches, and deeper context." />
      <section className="section pathways-index-section">
        <div className="shell pathway-directory">
          <nav className="pathway-category-nav" aria-label="Pathway categories">
            {grouped.map((group) => (
              <a key={group.title} href={`#${group.title.toLowerCase().replaceAll(" ", "-")}`}>
                {group.title}<span>{group.items.length}</span>
              </a>
            ))}
          </nav>

          {grouped.map((group) => (
            <section className="pathway-category-section" id={group.title.toLowerCase().replaceAll(" ", "-")} key={group.title}>
              <header className="pathway-category-heading">
                <div><span className="eyebrow">Pathway collection</span><h2>{group.title}</h2></div>
                <p>{group.description}</p>
              </header>
              <div className="pathway-grid">
                {group.items.map((pathway, index) => (
                  <Link className="pathway-card" href={`/pathways/${pathway.slug}`} key={pathway.slug} data-reveal>
                    <span className="pathway-number">{String(index + 1).padStart(2, "0")}</span>
                    <Route size={23} />
                    <span className="eyebrow">Scripture pathway</span>
                    <h2>{pathway.title}</h2>
                    <p>{pathway.summary}</p>
                    <div className="pathway-meta"><span><Clock3 size={12} /> {pathway.estimatedMinutes} min</span><span>{pathway.steps.length} key steps</span><span>{pathway.level}</span></div>
                    <span className="text-link">Preview pathway <ArrowRight size={16} /></span>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>
      <section className="section section-tight"><div className="shell"><AppBridge origin="pathways-index" /></div></section>
    </>
  );
}
