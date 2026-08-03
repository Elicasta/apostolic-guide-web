import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, BookOpen, Clock3, Search } from "lucide-react";
import type { Article, Section, Topic } from "./data";
import { buildAppUrl } from "./urls";

export function Brand({ reversed = false }: { reversed?: boolean }) {
  return (
    <Link className="brand" href="/" aria-label="Apostolic Guide home">
      <Image
        src={reversed ? "/brand/apostolic-guide-wordmark-reversed.png" : "/brand/apostolic-guide-wordmark.png"}
        width={223}
        height={18}
        alt="Apostolic Guide"
        priority
      />
    </Link>
  );
}

const navLinks = [
  ["Topics", "/topics"],
  ["Scripture", "/scripture"],
  ["Pathways", "/pathways"],
  ["Articles", "/articles"],
  ["Media", "/media"],
  ["About", "/about"]
] as const;

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="shell header-inner">
        <Brand />
        <nav className="desktop-nav" aria-label="Primary navigation">
          {navLinks.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}
        </nav>
        <div className="header-actions">
          <Link className="icon-link" href="/search" aria-label="Search"><Search size={19} /></Link>
          <a className="button button-dark header-app" href={buildAppUrl("/", { placement: "header" })}>Open App</a>
          <details className="mobile-menu">
            <summary aria-label="Open menu"><span /><span /><span /></summary>
            <div className="mobile-menu-panel">
              {navLinks.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}
              <Link href="/answers">Common Questions</Link>
              <Link href="/beliefs">What We Believe</Link>
              <a href={buildAppUrl("/", { placement: "mobile-menu" })}>Open App</a>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell footer-grid">
        <div className="footer-brand"><Brand reversed /><p>Search the Scriptures. Know what you believe.</p></div>
        <div><strong>Study</strong><Link href="/topics">Topics</Link><Link href="/answers">Answers</Link><Link href="/scripture">Scripture</Link><Link href="/pathways">Pathways</Link></div>
        <div><strong>Project</strong><Link href="/articles">Articles</Link><Link href="/media">Media</Link><Link href="/beliefs">Beliefs</Link><Link href="/about">About</Link><Link href="/contact">Contact</Link></div>
        <div><strong>Continue</strong><a href={buildAppUrl("/", { placement: "footer" })}>Open the app</a><Link href="/links">All links</Link><Link href="/admin">Admin</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></div>
      </div>
      <div className="shell footer-bottom"><span>© {new Date().getFullYear()} Apostolic Guide</span><span>Scripture · Doctrine · Answers</span></div>
    </footer>
  );
}

export function SearchForm({ defaultValue = "", compact = false }: { defaultValue?: string; compact?: boolean }) {
  const id = compact ? "search-compact" : "search-main";
  return (
    <form className={compact ? "search-form search-form-compact" : "search-form"} action="/search">
      <Search size={20} aria-hidden />
      <label className="sr-only" htmlFor={id}>Search Apostolic Guide</label>
      <input id={id} name="q" defaultValue={defaultValue} placeholder="Ask a question or enter a Scripture" autoComplete="off" />
      <button type="submit">Search</button>
    </form>
  );
}

export function TopicCard({ topic }: { topic: Topic }) {
  return (
    <Link className="topic-card" href={`/topics/${topic.slug}`}>
      <span className="topic-card-accent" aria-hidden>{topic.accent}</span>
      <span className="eyebrow">{topic.category}</span>
      <h3>{topic.title}</h3>
      <p>{topic.claim}</p>
      <span className="text-link">Explore topic <ArrowRight size={16} /></span>
    </Link>
  );
}

export function ArticleCard({ article, large = false }: { article: Article; large?: boolean }) {
  return (
    <Link className={large ? "article-card article-card-large" : "article-card"} href={`/articles/${article.slug}`}>
      <span className="eyebrow">{article.eyebrow}</span>
      <h3>{article.title}</h3>
      <p>{article.summary}</p>
      <span className="card-meta"><Clock3 size={15} /> {article.readingMinutes} min read</span>
    </Link>
  );
}

export function ScriptureMiniCard({ reference, point, href }: { reference: string; point: string; href: string }) {
  return (
    <Link className="scripture-mini" href={href}>
      <BookOpen size={19} />
      <span><strong>{reference}</strong><small>{point}</small></span>
      <ArrowRight size={17} />
    </Link>
  );
}

export function SectionHeading({ eyebrow, title, text, href, linkLabel }: { eyebrow?: string; title: string; text?: string; href?: string; linkLabel?: string }) {
  return (
    <div className="section-heading">
      <div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2>{text && <p>{text}</p>}</div>
      {href && <Link className="text-link" href={href}>{linkLabel ?? "View all"}<ArrowRight size={16} /></Link>}
    </div>
  );
}

export function PageHero({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return <section className="page-hero"><div className="shell page-hero-inner"><span className="eyebrow eyebrow-light">{eyebrow}</span><h1>{title}</h1><p>{text}</p></div></section>;
}

function headingId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-");
}

export function ContentBody({ sections }: { sections: Section[] }) {
  return (
    <div className="prose-content">
      {sections.map((section, index) => (
        <section
          id={section.heading ? headingId(section.heading) : undefined}
          key={`${section.heading ?? "section"}-${index}`}
        >
          {section.heading && <h2>{section.heading}</h2>}
          {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          {section.scripture && (
            <blockquote>
              <span>{section.scripture.reference}</span>
              {section.scripture.text}
            </blockquote>
          )}
        </section>
      ))}
    </div>
  );
}

export function DatabaseDocument({ body }: { body: unknown }) {
  const blocks = getDocumentBlocks(body);
  if (!blocks.length) return <div className="prose-content"><p>This content has been published, but its long-form body has not been added yet.</p></div>;
  return (
    <div className="prose-content">
      {blocks.map((block, index) => {
        const text = block.text;
        if (block.type === "heading") return <h2 id={String(text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")} key={index}>{text}</h2>;
        if (block.type === "quote") return <blockquote key={index}>{text}</blockquote>;
        return <p key={index}>{text}</p>;
      })}
    </div>
  );
}

function getDocumentBlocks(body: unknown): Array<{ type: string; text: string }> {
  if (!body || typeof body !== "object" || !("blocks" in body)) return [];
  const blocks = (body as { blocks?: unknown }).blocks;
  if (!Array.isArray(blocks)) return [];

  return blocks.flatMap((block) => {
    if (!block || typeof block !== "object") return [];
    const type = "type" in block && typeof block.type === "string" ? block.type : "paragraph";
    const data = "data" in block ? block.data : null;
    if (!data || typeof data !== "object" || !("text" in data) || typeof data.text !== "string") return [];
    return [{ type, text: data.text }];
  });
}

export function AppBridge({ origin = "website", compact = false }: { origin?: string; compact?: boolean }) {
  return (
    <section className={compact ? "app-bridge app-bridge-compact" : "app-bridge"}>
      <div><span className="eyebrow eyebrow-light">The study app</span><h2>Take the study further.</h2><p>Search Scripture, follow doctrine pathways, prepare for conversations, and organize your own studies.</p></div>
      {!compact && <div className="app-feature-list"><span>Fast Scripture search</span><span>Guided doctrine pathways</span><span>Saved studies and presentation mode</span></div>}
      <a className="button button-paper" href={buildAppUrl("/", { origin })}>Open Apostolic Guide App <ArrowUpRight size={17} /></a>
    </section>
  );
}
