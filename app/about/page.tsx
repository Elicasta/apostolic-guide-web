import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Bookmark,
  ExternalLink,
  Globe,
  MessageCircle,
  Presentation,
  Route,
  Search,
  Smartphone
} from "lucide-react";
import { PageHero } from "@/components";
import { buildAppUrl } from "@/urls";

export const metadata: Metadata = {
  title: "About",
  description: "Why Apostolic Guide exists, how the website and study app work together, and where to begin studying."
};

const principles = [
  ["01", "Quote the text.", "Begin with what Scripture actually says."],
  ["02", "Explain the context.", "Read the verse inside its argument and surrounding chapter."],
  ["03", "State the claim directly.", "Make the conclusion clear enough to examine."],
  ["04", "Answer the strongest objection.", "Do not make the case easier by avoiding the hard text."],
  ["05", "Connect the whole testimony.", "Compare Scripture with Scripture before reaching the conclusion."]
];

const startingPoints = [
  {
    href: "/scripture",
    label: "Scripture library",
    title: "Begin with a passage.",
    text: "Search, filter, and follow the passages connected to an idea.",
    icon: BookOpen
  },
  {
    href: "/pathways",
    label: "Guided pathways",
    title: "Follow the full case.",
    text: "Move through a doctrine one passage at a time in a deliberate sequence.",
    icon: Route
  },
  {
    href: "/answers",
    label: "Direct answers",
    title: "Start with the question.",
    text: "Find a clear answer, its key Scriptures, and the next place to study.",
    icon: MessageCircle
  },
  {
    href: "/articles",
    label: "Articles",
    title: "Read the argument deeply.",
    text: "Work through context, objections, conclusions, and connected studies.",
    icon: BookOpen
  }
];

export default function AboutPage() {
  const appHomeHref = buildAppUrl("/", { origin: "about-ecosystem" });
  const appPathsHref = buildAppUrl("/paths", { origin: "about-pathways" });

  return (
    <>
      <PageHero
        eyebrow="Why this exists"
        title="Truth deserves to be understood, not merely repeated."
        text="Apostolic Guide helps believers find the passage, follow the biblical pathway, answer the real question, and know why they believe what they believe."
      />

      <div className="about-v2">
        <section className="about-v2-jump" aria-label="About page sections">
          <nav className="shell">
            <a href="#purpose">The purpose</a>
            <a href="#method">Our method</a>
            <a href="#ecosystem">Website + app</a>
            <a href="#start">Start studying</a>
          </nav>
        </section>

        <section className="about-v2-section about-v2-purpose" id="purpose">
          <div className="shell">
            <header className="about-v2-heading" data-reveal>
              <span className="eyebrow">The purpose</span>
              <h2>Build the biblical pathway behind the conclusion.</h2>
              <p>A slogan may tell someone what to repeat. A pathway shows them where the belief comes from, how the passages connect, and how to explain it when questions come.</p>
            </header>

            <div className="about-v2-purpose-grid">
              <article data-reveal>
                <span>01 · The problem</span>
                <h3>Conclusions are often inherited without the Scriptures that support them.</h3>
                <p>When a real question comes, believers may remember the position but not the passage, context, or answer.</p>
              </article>
              <article data-reveal>
                <span>02 · The response</span>
                <h3>Connect doctrine, Scripture, questions, and explanation.</h3>
                <p>Apostolic Guide turns isolated references into a study that can be followed, shared, and used in conversation.</p>
                <Link href="/how-it-works">See the study method <ArrowRight size={16} /></Link>
              </article>
              <article data-reveal>
                <span>03 · The standard</span>
                <h3>Let Scripture lead—even when the passage is difficult.</h3>
                <p>The goal is not to hide the hard text. It is to state the claim clearly, face the objection honestly, and compare the whole testimony.</p>
              </article>
            </div>
          </div>
        </section>

        <section className="about-v2-section about-v2-method" id="method">
          <div className="shell about-v2-method-grid">
            <div className="about-v2-method-copy" data-reveal>
              <span className="eyebrow">Our editorial method</span>
              <h2>Scripture first. Clear enough to examine.</h2>
              <p>Every answer, topic, pathway, and article should help the reader open the Bible for themselves. Apostolic Guide is a starting point for study, never a substitute for the text.</p>
              <Link className="button button-dark" href="/beliefs">Read what we believe <ArrowRight size={16} /></Link>
            </div>

            <div className="about-v2-principles" data-reveal>
              {principles.map(([number, title, text]) => (
                <div key={number}>
                  <span>{number}</span>
                  <p><strong>{title}</strong><small>{text}</small></p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="about-v2-section about-v2-ecosystem" id="ecosystem">
          <div className="shell">
            <header className="about-v2-heading about-v2-heading-centered" data-reveal>
              <span className="eyebrow">One mission · Two environments</span>
              <h2>The website explains. The app equips.</h2>
              <p>The website is built for discovery, reading, sharing, and public teaching. The app is the working study environment where the same biblical material becomes searchable, saveable, and usable in the moment.</p>
            </header>

            <div className="about-v2-system-grid">
              <article className="about-v2-system-card about-v2-website-card" data-reveal>
                <div className="about-v2-system-icon"><Globe size={22} /></div>
                <span>THE WEBSITE</span>
                <h3>Read, understand, and share the biblical case.</h3>
                <p>Use the public library to explore doctrine, read complete articles, open Scripture pages, and follow concise pathway previews.</p>
                <ul>
                  <li><Search size={17} /> Discover the right starting point</li>
                  <li><BookOpen size={17} /> Read teaching in a clear editorial format</li>
                  <li><MessageCircle size={17} /> Share an answer or article with someone</li>
                </ul>
                <div className="about-v2-system-actions">
                  <Link className="button button-dark" href="/scripture">Browse Scripture <ArrowRight size={16} /></Link>
                  <Link className="about-v2-text-link" href="/articles">Read articles</Link>
                </div>
              </article>

              <article className="about-v2-system-card about-v2-app-card" data-reveal>
                <div className="about-v2-system-icon"><Smartphone size={22} /></div>
                <span>THE STUDY APP</span>
                <h3>Search faster. Follow deeper. Keep the study with you.</h3>
                <p>Use the app when you need to retrieve Scripture quickly, continue a full pathway, save material, prepare for a conversation, or present a study.</p>
                <div className="about-v2-app-features">
                  <span><Search size={17} /><strong>Search</strong><small>Find the verse from a phrase, reference, or question.</small></span>
                  <span><Route size={17} /><strong>Pathways</strong><small>Continue the expanded passage sequence and objections.</small></span>
                  <span><Bookmark size={17} /><strong>Saved studies</strong><small>Keep the material you need ready for later.</small></span>
                  <span><Presentation size={17} /><strong>Use it live</strong><small>Prepare for teaching, conversation, and presentation.</small></span>
                </div>
                <div className="about-v2-system-actions">
                  <a className="button button-paper" href={appHomeHref}>Open the study app <ExternalLink size={16} /></a>
                  <a className="about-v2-text-link" href={appPathsHref}>Browse full app pathways</a>
                </div>
              </article>
            </div>

            <div className="about-v2-handoff" data-reveal>
              <span><strong>Website</strong><small>Understand the central case</small></span>
              <ArrowRight size={20} />
              <span><strong>App</strong><small>Continue, save, search, and use it</small></span>
            </div>
          </div>
        </section>

        <section className="about-v2-section about-v2-start" id="start">
          <div className="shell">
            <header className="about-v2-heading" data-reveal>
              <span className="eyebrow">Choose a starting point</span>
              <h2>Do not leave the About page at a dead end.</h2>
              <p>Start with the kind of question or study you already have in front of you.</p>
            </header>

            <div className="about-v2-start-grid">
              {startingPoints.map((item) => {
                const Icon = item.icon;
                return (
                  <Link href={item.href} key={item.href} data-reveal>
                    <Icon size={21} />
                    <span>{item.label}</span>
                    <h3>{item.title}</h3>
                    <p>{item.text}</p>
                    <strong>Explore <ArrowRight size={16} /></strong>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>

        <section className="about-v2-declaration">
          <div className="shell" data-reveal>
            <span>THE CONVICTION</span>
            <h2>Questions should be welcomed. Scripture should lead the conversation.</h2>
            <Link className="button button-paper" href="/beliefs">What we believe <ArrowRight size={16} /></Link>
          </div>
        </section>
      </div>
    </>
  );
}
