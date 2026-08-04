import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AppBridge, PageHero } from "@/components";
import { StudyScriptures } from "@/study-guidance";

export const metadata: Metadata = {
  title: "What We Believe",
  description: "A Scripture-first summary of Apostolic Guide's beliefs about God, Jesus Christ, salvation, and biblical study."
};

const beliefs = [
  ["Scripture", "We believe the Bible is the inspired and authoritative Word of God. Every doctrine should be studied in context and compared with the whole testimony of Scripture."],
  ["God", "We believe God is one, indivisible, eternal Spirit. He alone is Creator, Savior, King, the First, and the Last."],
  ["Jesus Christ", "We believe Jesus Christ is the full revelation of the invisible God in genuine humanity. All the fullness of the Godhead dwells bodily in him."],
  ["The Father and the Son", "We believe the Father is the eternal Spirit dwelling in and revealed through the Son. The Son is the genuine human life of Jesus Christ, conceived by the Holy Ghost and born of Mary."],
  ["The Holy Ghost", "We believe the Holy Ghost is God's own Spirit poured out and dwelling in believers, not another divine Spirit beside the Father."],
  ["The Gospel", "We believe Jesus Christ died for our sins, was buried, and rose again. The apostolic response is repentance, baptism in the name of Jesus Christ, and receiving the gift of the Holy Ghost."],
  ["The Name", "We believe Jesus is the saving name revealed, preached, and invoked by the apostles."],
  ["Study", "We believe questions should be welcomed. Believers should know not only what they believe, but why they believe it."]
];

const beliefReferences = [
  "2 Timothy 3:16",
  "Deuteronomy 6:4",
  "Colossians 2:9",
  "John 14:9–11",
  "Acts 2:38"
];

export default function BeliefsPage() {
  return (
    <>
      <PageHero
        eyebrow="Our confession"
        title="What we believe"
        text="Truth deserves to be understood, not merely repeated. These statements summarize the framework that guides Apostolic Guide."
      />
      <section className="section">
        <div className="shell belief-list">
          {beliefs.map(([title, text], index) => <article key={title}><span>0{index + 1}</span><div><h2>{title}</h2><p>{text}</p></div></article>)}
        </div>
      </section>
      <section className="section section-tight">
        <div className="shell two-column-callout">
          <div><span className="eyebrow">Do not stop at the statement</span><h2>Follow the biblical case.</h2></div>
          <div><p>The beliefs page tells you what Apostolic Guide teaches. The topic library shows the passages, explanations, objections, and pathways behind each claim.</p><Link className="text-link" href="/topics">Explore the topics <ArrowRight size={16} /></Link></div>
        </div>
      </section>
      <section className="section section-tight"><div className="shell"><StudyScriptures references={beliefReferences} /></div></section>
      <section className="section section-tight"><div className="shell"><AppBridge origin="beliefs" /></div></section>
    </>
  );
}
