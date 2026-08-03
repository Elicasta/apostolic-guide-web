import Link from "next/link";
import { ArrowRight, ArrowUpRight, BookOpen, Route, Search } from "lucide-react";
import { SearchForm } from "@/components";
import { ArticlePoster } from "@/article-poster";
import { BrandCrown } from "@/brand-marks";
import { answers, articles, pathways, scriptures, topics } from "@/data";
import { buildAppUrl } from "@/urls";

export default function HomePage() {
  const featuredPathway = pathways[0];
  const spotlight = scriptures.find((item) => item.reference === "John 14:9–11") ?? scriptures[0];
  const featuredAnswers = answers.slice(0, 5);
  const featuredTopics = topics.slice(0, 5);
  const featuredArticles = articles.slice(0, 4);

  return (
    <div className="editorial-interface">
      <section className="ei-hero">
        <div className="shell ei-hero-grid">
          <div className="ei-hero-copy">
            <div className="ei-system-label"><span>AG / PUBLIC LIBRARY</span><span>001—SCRIPTURE</span></div>
            <span className="ei-kicker">Scripture first. Questions welcome.</span>
            <h1>Know what you believe.<span>Know why.</span></h1>
            <p>Search Scripture, follow connected passages, and understand Apostolic doctrine from the text itself.</p>
            <div className="ei-actions">
              <Link className="button button-crimson" href="#search">Search Scripture <Search size={17} /></Link>
              <Link className="button button-outline" href="/topics">Explore topics <ArrowRight size={17} /></Link>
            </div>
          </div>

          <aside className="ei-live-index" aria-label="Apostolic Guide live content index">
            <header><span>LIVE INDEX</span><span>CURATED / 08</span></header>
            <div className="ei-index-query"><Search size={16} /><span>Why did Jesus pray?</span><b>↵</b></div>
            <div className="ei-index-result ei-index-featured">
              <div><span>BEST MATCH</span><span>{spotlight.reference}</span></div>
              <h2>{spotlight.mainPoint}</h2>
              <p>“{spotlight.text}”</p>
              <Link href={`/scripture/${spotlight.path}`}>Open passage <ArrowRight size={15} /></Link>
            </div>
            <div className="ei-index-links">
              {featuredAnswers.slice(0, 3).map((answer, index) => (
                <Link href={`/answers/${answer.slug}`} key={answer.slug}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{answer.question}</strong>
                  <ArrowRight size={14} />
                </Link>
              ))}
            </div>
            <footer><span>Scripture · Doctrine · Answers</span><span>Curated for study</span></footer>
          </aside>
        </div>
      </section>

      <section className="ei-search" id="search">
        <div className="shell ei-section-grid">
          <div className="ei-section-intro">
            <span className="ei-section-number">01</span>
            <span className="ei-kicker">Scripture search</span>
            <h2>Start with the question in front of you.</h2>
          </div>
          <div className="ei-search-control">
            <SearchForm />
            <div className="ei-search-suggestions">
              <span>TRY</span>
              <Link href="/search?q=Is+Jesus+God">Is Jesus God?</Link>
              <Link href="/search?q=Why+did+Jesus+pray">Why did Jesus pray?</Link>
              <Link href="/search?q=Right+hand+of+God">Right hand of God</Link>
              <Link href="/search?q=Baptism+in+Jesus+name">Baptism in Jesus&apos; name</Link>
            </div>
          </div>
        </div>
      </section>

      <section className="ei-questions">
        <div className="shell ei-section-heading">
          <div>
            <span className="ei-section-number">02</span>
            <span className="ei-kicker">Direct answers</span>
            <h2>Begin with the real objection.</h2>
          </div>
          <p>Read the direct answer first. Then examine the passages, context, and connected evidence.</p>
        </div>

        <div className="shell ei-question-index">
          {featuredAnswers.map((answer, index) => (
            <Link className="ei-question-row" href={`/answers/${answer.slug}`} key={answer.slug} data-reveal>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h3>{answer.question}</h3>
              <p>{answer.shortAnswer}</p>
              <span className="ei-row-action"><ArrowRight size={18} /></span>
            </Link>
          ))}
          <Link className="ei-index-footer-link" href="/answers">View all questions <ArrowRight size={16} /></Link>
        </div>
      </section>

      <section className="ei-topics">
        <div className="shell ei-section-heading ei-section-heading-dark">
          <div>
            <span className="ei-section-number">03</span>
            <span className="ei-kicker ei-kicker-light">Doctrine library</span>
            <h2>Follow the whole biblical case.</h2>
          </div>
          <p>One claim. Key passages. Common objections. A clear next step.</p>
        </div>

        <div className="shell ei-topic-interface">
          <div className="ei-topic-rail" aria-hidden="true">
            <span>TOPICS</span><span>08 ENTRIES</span><span>FILTER / ALL</span>
          </div>
          <div className="ei-topic-list">
            {featuredTopics.map((topic, index) => (
              <Link className="ei-topic-row" href={`/topics/${topic.slug}`} key={topic.slug} data-reveal>
                <span className="ei-topic-number">{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <span className="ei-topic-category">{topic.category}</span>
                  <h3>{topic.title}</h3>
                </div>
                <p>{topic.claim}</p>
                <span className="ei-topic-arrow"><ArrowRight size={19} /></span>
                <span className="ei-topic-word" aria-hidden>{topic.accent}</span>
              </Link>
            ))}
          </div>
          <Link className="ei-dark-link" href="/topics">Browse all topics <ArrowRight size={16} /></Link>
        </div>
      </section>

      <section className="ei-pathway">
        <div className="shell ei-pathway-grid">
          <div className="ei-pathway-copy">
            <span className="ei-section-number">04</span>
            <span className="ei-kicker">Guided pathway</span>
            <h2>{featuredPathway.title}</h2>
            <p>{featuredPathway.summary}</p>
            <div className="ei-pathway-meta">
              <span>{featuredPathway.steps.length} passages</span>
              <span>{featuredPathway.estimatedMinutes} min</span>
              <span>{featuredPathway.level}</span>
            </div>
            <Link className="button button-dark" href={`/pathways/${featuredPathway.slug}`}>Begin pathway <Route size={17} /></Link>
          </div>

          <div className="ei-pathway-interface" data-reveal>
            <header><span>PATH / {featuredPathway.slug.toUpperCase()}</span><span>STEP SEQUENCE</span></header>
            <div className="ei-pathway-track">
              {featuredPathway.steps.map((step, index) => (
                <Link href={`/pathways/${featuredPathway.slug}`} className="ei-pathway-step" key={`${step.reference}-${index}`}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div><strong>{step.title}</strong><small>{step.reference}</small></div>
                  <ArrowRight size={16} />
                </Link>
              ))}
            </div>
            <footer><span>Open in sequence</span><span>Follow the evidence →</span></footer>
          </div>
        </div>
      </section>

      <section className="ei-editorial">
        <div className="shell ei-editorial-heading">
          <div>
            <span className="ei-section-number">05</span>
            <span className="ei-kicker">Studies</span>
            <h2>Go deeper into the text.</h2>
          </div>
          <p>Focused studies tracing Scripture, context, and connected passages without skipping the hard questions.</p>
        </div>
        <div className="shell ei-poster-grid">
          {featuredArticles.map((article, index) => (
            <ArticlePoster
              key={article.slug}
              slug={article.slug}
              title={article.title}
              eyebrow={article.eyebrow}
              summary={article.summary}
              readingMinutes={article.readingMinutes}
              index={index}
            />
          ))}
        </div>
        <div className="shell ei-editorial-link"><Link href="/articles">View all studies <ArrowRight size={16} /></Link></div>
      </section>

      <section className="ei-declaration">
        <div className="shell ei-declaration-grid">
          <div>
            <BrandCrown className="ag-declaration-crown" />
            <span className="ei-section-number">06</span>
            <span className="ei-kicker ei-kicker-light">Apostolic Guide</span>
            <h2>Jesus is God.<br />Scripture leads the conversation.</h2>
          </div>
          <div className="ei-declaration-side">
            <p>Truth deserves to be understood, not merely repeated.</p>
            <div>
              <Link className="button button-paper" href="/scripture">Browse Scripture <BookOpen size={17} /></Link>
              <a className="button button-outline ei-outline-light" href={buildAppUrl("/", { placement: "editorial-interface-final" })}>Open the app <ArrowUpRight size={17} /></a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
