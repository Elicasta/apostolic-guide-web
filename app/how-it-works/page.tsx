import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, Search } from "lucide-react";
import { PageHero } from "@/components";
import { StudyScriptures } from "@/study-guidance";

export const metadata: Metadata = {
  title: "How Apostolic Guide Works",
  description: "Learn how to use Apostolic Guide as a starting point for personal Bible study, contextual reading, and connected Scripture research.",
  alternates: { canonical: "/how-it-works" }
};

const steps = [
  {
    title: "Start with a real question.",
    text: "Search with the words you would naturally use. Begin with the objection, passage, or doctrine already in front of you."
  },
  {
    title: "Read the guide.",
    text: "Use the summary to understand the central biblical claim and identify the passages that build the case."
  },
  {
    title: "Open every Scripture.",
    text: "Do not stop with an excerpt. Read the surrounding chapter, notice the speaker and audience, and follow the argument."
  },
  {
    title: "Compare Scripture with Scripture.",
    text: "Follow the connected passages. Let clear texts explain difficult texts and let the whole biblical witness shape the doctrine."
  },
  {
    title: "Study prayerfully.",
    text: "Slow down. Ask what the passage actually says before asking how it supports a position."
  },
  {
    title: "Form your conclusion from the text.",
    text: "The goal is not merely to agree with Apostolic Guide. The goal is to know God's Word and understand why you believe it."
  }
];

export default function HowItWorksPage() {
  return (
    <div className="how-page">
      <PageHero
        variant="scripture"
        eyebrow="How Apostolic Guide works"
        title="A guide back to the text."
        text="Apostolic Guide helps you find the passages, follow the connections, and study the biblical case. It is not a replacement for your Bible."
      />

      <section className="section how-method-intro">
        <div className="shell how-method-intro-grid">
          <div>
            <span className="eyebrow">The promise</span>
            <h2>We give you a map. Scripture remains the authority.</h2>
          </div>
          <p>Every answer, topic, pathway, and study is designed to send you back to the Word of God. Use the site to locate the evidence. Then open your Bible and examine it for yourself.</p>
        </div>
      </section>

      <section className="section section-tight">
        <div className="shell study-method-grid">
          {steps.map((step, index) => (
            <article className="study-method-step" key={step.title}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <h2>{step.title}</h2>
                <p>{step.text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="section section-tight">
        <div className="shell">
          <div className="study-method-principle">
            <div>
              <span className="eyebrow eyebrow-light">The study rhythm</span>
              <h2>Find the passage. Read the chapter. Follow the connections.</h2>
            </div>
            <div>
              <p>Answers on this site are a starting point. The strongest understanding comes from reading each passage in context and comparing it with the rest of Scripture.</p>
              <div className="how-method-actions">
                <Link className="button button-paper" href="/search">Start with a question <Search size={16} /></Link>
                <Link className="button button-outline ei-outline-light" href="/scripture">Browse Scripture <BookOpen size={16} /></Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section section-tight">
        <div className="shell">
          <StudyScriptures references={["John 5:39", "Acts 17:11", "2 Timothy 2:15"]} />
          <Link className="text-link" href="/topics">Begin with a doctrine <ArrowRight size={15} /></Link>
        </div>
      </section>
    </div>
  );
}
