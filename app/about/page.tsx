import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageHero } from "@/components";

export const metadata: Metadata = {
  title: "About",
  description: "Why Apostolic Guide exists and how its Scripture-first theological library is built."
};

export default function AboutPage() {
  return (
    <>
      <PageHero
        eyebrow="Why this exists"
        title="A place to search, study, connect, and explain."
        text="Apostolic Guide was built so biblical truth can be examined clearly, followed through Scripture, and used in real conversations."
      />
      <section className="section">
        <div className="shell about-grid">
          <article className="prose-content">
            <section><h2>The problem</h2><p>Many believers inherit conclusions without receiving the biblical pathway that supports them. When a question comes, they remember a slogan but cannot find the passage, explain the context, or answer the objection.</p></section>
            <section><h2>The response</h2><p>Apostolic Guide connects doctrines to Scriptures, Scriptures to related passages, questions to direct answers, and public teaching to a deeper study app.</p></section>
            <section><h2>The standard</h2><p>The goal is not to make a difficult subject sound easy by hiding the hard texts. The goal is to state the position clearly, acknowledge the real question, and let Scripture lead the argument.</p></section>
          </article>
          <aside className="about-principles">
            <span className="eyebrow">Editorial principles</span>
            <strong>Quote the text.</strong>
            <strong>Explain the context.</strong>
            <strong>State the claim directly.</strong>
            <strong>Answer the strongest objection.</strong>
            <strong>Connect the whole testimony.</strong>
          </aside>
        </div>
      </section>
      <section className="section section-dark">
        <div className="shell two-column-callout two-column-callout-dark">
          <div><span className="eyebrow eyebrow-light">The ecosystem</span><h2>The website explains. The app equips.</h2></div>
          <div><p>The website is the public theological library. The app is the working environment for search, pathways, saved studies, conversations, and presentations.</p><Link className="button button-paper" href="/links">Explore every link <ArrowRight size={16} /></Link></div>
        </div>
      </section>
    </>
  );
}
