import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Clock3, Route } from "lucide-react";
import { AppBridge, PageHero } from "@/components";
import { pathways, topicBySlug } from "@/data";

export const metadata: Metadata = {
  title: "Scripture Pathways",
  description: "Follow guided sequences of connected Scriptures through Apostolic doctrine and common questions."
};

const categoryOrder = ["God and Christ", "Salvation", "Biblical interpretation"] as const;

export default function PathwaysPage() {
  const grouped = categoryOrder.map((category) => ({
    category,
    items: pathways.filter((pathway) => topicBySlug(pathway.topicSlug)?.category === category)
  })).filter((group) => group.items.length > 0);

  return (
    <>
      <PageHero variant="pathways" eyebrow="Guided Scripture studies" title="Do not collect isolated verses. Follow the pathway." text="Each pathway establishes the starting point, moves through connected passages, and shows how the biblical argument develops." />
      <section className="section pathways-index-section">
        <div className="shell pathway-directory">
          <nav className="pathway-category-nav" aria-label="Pathway categories">
            {grouped.map((group) => <a key={group.category} href={`#${group.category.toLowerCase().replaceAll(" ", "-")}`}>{group.category}<span>{group.items.length}</span></a>)}
          </nav>

          {grouped.map((group) => (
            <section className="pathway-category-section" id={group.category.toLowerCase().replaceAll(" ", "-")} key={group.category}>
              <header className="pathway-category-heading">
                <div><span className="eyebrow">Pathway collection</span><h2>{group.category}</h2></div>
                <p>{group.category === "God and Christ" ? "Begin with who God is, who Jesus is, and how Scripture explains the incarnation." : group.category === "Salvation" ? "Follow the gospel response, the saving name, and the apostolic pattern." : "Study difficult biblical language through the way Scripture itself uses it."}</p>
              </header>
              <div className="pathway-grid">
                {group.items.map((pathway, index) => (
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
          ))}
        </div>
      </section>
      <section className="section section-tight"><div className="shell"><AppBridge origin="pathways-index" /></div></section>
    </>
  );
}
