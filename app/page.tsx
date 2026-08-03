import Link from "next/link";
import { ArrowRight, ArrowUpRight, BookOpen, Route, Search } from "lucide-react";
import { SearchForm } from "@/components";
import { answers, articles, pathways, scriptures, topics } from "@/data";
import { buildAppUrl } from "@/urls";

export default function HomePage() {
  const featuredPathway = pathways[0];
  const spotlight = scriptures.find((item) => item.reference === "John 14:9–11") ?? scriptures[0];
  const featuredTopics = topics.slice(0, 4);
  const featuredAnswers = answers.slice(0, 5);
  const featuredArticles = articles.slice(0, 3);

  return (
    <div className="home-reset">
      <section className="hr-hero">
        <div className="shell hr-hero-grid">
          <div className="hr-hero-copy">
            <span className="hr-kicker">Scripture first. Questions welcome.</span>
            <h1>Know what you believe.<span>Know why.</span></h1>
            <p>Search Scripture, follow connected passages, and build a clearer understanding of Apostolic doctrine from the text itself.</p>
            <div className="hr-actions">
              <Link className="button button-crimson" href="#search">Search Scripture <Search size={17} /></Link>
              <Link className="button button-outline" href="/topics">Explore topics <ArrowRight size={17} /></Link>
            </div>
          </div>

          <aside className="hr-scripture-signal" aria-label={`Featured Scripture ${spotlight.reference}`}>
            <span className="hr-signal-label">Featured passage</span>
            <div className="hr-signal-reference">{spotlight.reference}</div>
            <blockquote>“{spotlight.text}”</blockquote>
            <p>{spotlight.mainPoint}</p>
            <Link href={`/scripture/${spotlight.path}`}>Open passage <ArrowRight size={15} /></Link>
          </aside>
        </div>
      </section>

      <section className="hr-search" id="search">
        <div className="shell hr-search-inner">
          <div>
            <span className="hr-section-index">01</span>
            <h2>Start with the question in front of you.</h2>
          </div>
          <div>
            <SearchForm />
            <div className="hr-search-suggestions">
              <span>Try</span>
              <Link href="/search?q=Is+Jesus+God">Is Jesus God?</Link>
              <Link href="/search?q=Why+did+Jesus+pray">Why did Jesus pray?</Link>
              <Link href="/search?q=Right+hand+of+God">Right hand of God</Link>
              <Link href="/search?q=Baptism+in+Jesus+name">Baptism in Jesus&apos; name</Link>
            </div>
          </div>
        </div>
      </section>

      <section className="hr-questions">
        <div className="shell hr-split-heading">
          <div>
            <span className="hr-section-index">02</span>
            <span className="hr-kicker">Direct answers</span>
            <h2>Begin with the real objection.</h2>
          </div>
          <p>Read the direct answer first. Then open the passages, examine the context, and follow the connected evidence.</p>
        </div>

        <div className="shell hr-question-list">
          {featuredAnswers.map((answer, index) => (
            <Link className="hr-question-row" href={`/answers/${answer.slug}`} key={answer.slug}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h3>{answer.question}</h3>
              <p>{answer.shortAnswer}</p>
              <ArrowRight size={19} />
            </Link>
          ))}
        </div>
      </section>

      <section className="hr-topics">
        <div className="shell hr-topics-heading">
          <div>
            <span className="hr-section-index">03</span>
            <span className="hr-kicker hr-kicker-light">Doctrine library</span>
            <h2>Follow the whole biblical case.</h2>
          </div>
          <p>Each topic begins with one central claim, then opens the passages, questions, and pathways that support it.</p>
        </div>

        <div className="shell hr-topic-list">
          {featuredTopics.map((topic, index) => (
            <Link className="hr-topic-row" href={`/topics/${topic.slug}`} key={topic.slug}>
              <span className="hr-topic-number">{String(index + 1).padStart(2, "0")}</span>
              <div>
                <span className="hr-topic-category">{topic.category}</span>
                <h3>{topic.title}</h3>
              </div>
              <p>{topic.claim}</p>
              <span className="hr-topic-arrow"><ArrowRight size={20} /></span>
              <span className="hr-topic-accent" aria-hidden>{topic.accent}</span>
            </Link>
          ))}
        </div>

        <div className="shell hr-section-link"><Link href="/topics">Browse all topics <ArrowRight size={16} /></Link></div>
      </section>

      <section className="hr-pathway">
        <div className="shell hr-pathway-grid">
          <div className="hr-pathway-copy">
            <span className="hr-section-index">04</span>
            <span className="hr-kicker">Guided Scripture pathway</span>
            <h2>{featuredPathway.title}</h2>
            <p>{featuredPathway.summary}</p>
            <div className="hr-pathway-meta">
              <span>{featuredPathway.steps.length} passages</span>
              <span>{featuredPathway.estimatedMinutes} minutes</span>
              <span>{featuredPathway.level}</span>
            </div>
            <Link className="button button-dark" href={`/pathways/${featuredPathway.slug}`}>Begin pathway <Route size={17} /></Link>
          </div>

          <div className="hr-pathway-steps">
            {featuredPathway.steps.map((step, index) => (
              <Link href={`/pathways/${featuredPathway.slug}`} className="hr-pathway-step" key={`${step.reference}-${index}`}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div><strong>{step.title}</strong><small>{step.reference}</small></div>
                <ArrowRight size={17} />
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="hr-manifesto">
        <div className="shell hr-manifesto-inner">
          <span className="hr-section-index">05</span>
          <blockquote>“Search the scriptures…”</blockquote>
          <p>Truth deserves to be understood, not merely repeated.</p>
          <div className="hr-manifesto-links">
            <Link href="/scripture">Browse Scripture <BookOpen size={16} /></Link>
            <Link href="/beliefs">What we believe <ArrowRight size={16} /></Link>
          </div>
        </div>
      </section>

      <section className="hr-editorial">
        <div className="shell hr-editorial-grid">
          <div>
            <span className="hr-section-index">06</span>
            <span className="hr-kicker">Read further</span>
            <h2>Open the argument, not just the conclusion.</h2>
          </div>

          <div className="hr-article-list">
            {featuredArticles.map((article) => (
              <Link href={`/articles/${article.slug}`} className="hr-article-row" key={article.slug}>
                <span>{article.eyebrow}</span>
                <h3>{article.title}</h3>
                <p>{article.summary}</p>
                <ArrowRight size={18} />
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="hr-final">
        <div className="shell hr-final-grid">
          <div>
            <span className="hr-kicker hr-kicker-light">Apostolic Guide</span>
            <h2>Jesus is God.<br />Scripture leads the conversation.</h2>
          </div>
          <div className="hr-final-actions">
            <a className="button button-paper" href={buildAppUrl("/", { placement: "home-reset-final" })}>Open the app <ArrowUpRight size={17} /></a>
            <Link className="button button-outline hr-outline-light" href="/about">About the project</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
