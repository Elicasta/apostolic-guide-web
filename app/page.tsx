import Link from "next/link";
import { ArrowRight, ArrowUpRight, BookOpen, Check, Play, Search, Sparkles } from "lucide-react";
import { AppBridge, ArticleCard, SearchForm, SectionHeading, TopicCard } from "@/components";
import { answers, articles, media, pathways, scriptures, topics } from "@/data";
import { buildAppUrl } from "@/urls";

export default function HomePage() {
  const featuredPathway = pathways[0];
  const scripture = scriptures.find((item) => item.reference === "John 14:9–11") ?? scriptures[0];

  return (
    <>
      <section className="hero home-hero">
        <div className="shell hero-inner">
          <div className="hero-copy">
            <span className="eyebrow">Scripture first. Questions welcome.</span>
            <h1>Know what you believe.<br /><span>Know why.</span></h1>
            <p className="hero-lede">Search Scripture, follow connected passages, explore Apostolic doctrine, and build a clearer understanding of God&apos;s Word.</p>
            <div className="hero-actions">
              <Link className="button button-crimson" href="#search">Search Scripture <Search size={17} /></Link>
              <Link className="button button-outline" href="/topics">Explore topics <ArrowRight size={17} /></Link>
            </div>
            <div className="hero-proof" aria-label="Apostolic Guide principles">
              <span><Check size={15} /> Scripture in context</span>
              <span><Check size={15} /> Direct answers</span>
              <span><Check size={15} /> Connected pathways</span>
            </div>
          </div>
          <aside className="hero-side" aria-label="Featured Scripture">
            <div className="hero-statement">
              <strong>John 5:39</strong>
              <blockquote>“Search the scriptures; for in them ye think ye have eternal life: and they are they which testify of me.”</blockquote>
              <span>Jesus Christ</span>
            </div>
            <div className="hero-watermark" aria-hidden>AG</div>
          </aside>
        </div>
      </section>

      <section className="search-band" id="search">
        <div className="shell">
          <SearchForm />
          <div className="search-suggestions">
            <span>Try:</span>
            <Link href="/search?q=Is+Jesus+God">Is Jesus God?</Link>
            <Link href="/search?q=Why+did+Jesus+pray">Why did Jesus pray?</Link>
            <Link href="/search?q=John+14%3A9">John 14:9</Link>
            <Link href="/search?q=Baptism+in+Jesus+name">Baptism in Jesus&apos; name</Link>
          </div>
        </div>
      </section>

      <section className="section home-manifesto-section">
        <div className="shell home-manifesto">
          <span className="manifesto-number">01</span>
          <div>
            <span className="eyebrow">Why Apostolic Guide exists</span>
            <p>Truth deserves to be understood, not merely repeated. Every claim should be traceable to the text, explainable in context, and strong enough to answer the real question.</p>
          </div>
          <Link className="manifesto-link" href="/about">Read our approach <ArrowUpRight size={18} /></Link>
        </div>
      </section>

      <section className="section section-tight">
        <div className="shell">
          <SectionHeading eyebrow="Start with the real question" title="Direct answers without dodging the text." text="Find the question you are actually trying to answer, then follow the Scriptures behind the conclusion." href="/answers" linkLabel="See all answers" />
          <div className="question-grid">
            {answers.slice(0, 6).map((answer, index) => (
              <Link className="question-link" href={`/answers/${answer.slug}`} key={answer.slug}>
                <span>0{index + 1}<ArrowRight size={15} /></span>
                {answer.question}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="section topics-home-section">
        <div className="shell">
          <SectionHeading eyebrow="Doctrine library" title="Study the whole biblical case." text="Each topic connects the central claim, key passages, common objections, and a guided next step." href="/topics" linkLabel="Browse all topics" />
          <div className="topic-grid">
            {topics.slice(0, 6).map((topic) => <TopicCard topic={topic} key={topic.slug} />)}
          </div>
        </div>
      </section>

      <section className="section section-dark">
        <div className="shell featured-study">
          <div>
            <span className="eyebrow eyebrow-light">Featured pathway</span>
            <h2>{featuredPathway.title}</h2>
            <p>{featuredPathway.summary}</p>
            <div className="study-metrics">
              <span>{featuredPathway.steps.length} connected passages</span>
              <span>{featuredPathway.estimatedMinutes} minute study</span>
              <span>{featuredPathway.level}</span>
            </div>
            <Link className="button button-paper" href={`/pathways/${featuredPathway.slug}`}>Begin pathway <ArrowRight size={17} /></Link>
          </div>
          <div className="study-steps">
            {featuredPathway.steps.map((step, index) => (
              <div className="study-step" key={step.reference}>
                <b>{String(index + 1).padStart(2, "0")}</b>
                <div><strong>{step.title}</strong><small>{step.reference}</small></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section scripture-home-section">
        <div className="shell scripture-focus">
          <div className="scripture-focus-label">Scripture spotlight</div>
          <div>
            <blockquote>“{scripture.text}”</blockquote>
            <p><strong>{scripture.reference}</strong> · {scripture.translation}</p>
            <p className="scripture-focus-point">{scripture.mainPoint}</p>
            <Link className="text-link" href={`/scripture/${scripture.path}`}>Study this passage <ArrowRight size={16} /></Link>
          </div>
        </div>
      </section>

      <section className="section articles-home-section">
        <div className="shell">
          <SectionHeading eyebrow="Editorial study" title="Read the argument, not just the conclusion." text="Long-form explanations built to be opened, checked, challenged, and followed through Scripture." href="/articles" linkLabel="Read all articles" />
          <div className="home-article-grid">
            {articles.slice(0, 3).map((article, index) => <ArticleCard article={article} large={index === 0} key={article.slug} />)}
          </div>
        </div>
      </section>

      <section className="section section-dark home-media-section">
        <div className="shell">
          <SectionHeading eyebrow="Watch and listen" title="The Apostolic Guide media library." text="Teaching, short explanations, visual Scripture content, and music built from the same study framework." href="/media" linkLabel="Explore media" />
          <div className="home-media-grid">
            {media.map((item, index) => (
              <article className="home-media-card" key={item.slug}>
                <span className="home-media-number">0{index + 1}</span>
                <div className="home-media-icon">{item.type === "Teaching" ? <Play size={22} /> : item.type === "Music" ? <Sparkles size={22} /> : <BookOpen size={22} />}</div>
                <span className="eyebrow eyebrow-light">{item.type} · {item.duration}</span>
                <h3>{item.title}</h3>
                <p>{item.summary}</p>
                <span className="media-status">{item.url ? "Available now" : "Coming soon"}</span>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section belief-home-section">
        <div className="shell belief-band">
          <h2>What we believe</h2>
          <div className="belief-copy">
            <p>God is one.</p>
            <p>Jesus Christ is the full revelation of the invisible God in genuine humanity for our salvation.</p>
            <p>Scripture should lead the conversation.</p>
            <Link className="text-link" href="/beliefs">Read the full statement <ArrowRight size={16} /></Link>
          </div>
        </div>
      </section>

      <section className="section section-tight"><div className="shell"><AppBridge origin="homepage" /></div></section>

      <section className="section home-final-cta">
        <div className="shell final-cta-inner">
          <span className="eyebrow">Continue the study</span>
          <h2>Open the text.<br />Follow the evidence.</h2>
          <div>
            <Link className="button button-paper" href="/scripture">Browse Scripture <BookOpen size={17} /></Link>
            <a className="button button-outline button-outline-light" href={buildAppUrl("/", { placement: "home-final" })}>Open the app <ArrowUpRight size={17} /></a>
          </div>
        </div>
      </section>
    </>
  );
}
