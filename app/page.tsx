import Link from "next/link";
import { ArrowRight, ArrowUpRight, BookOpen, Check, ChevronRight, Compass, Play, Route, Search, Sparkles } from "lucide-react";
import { SearchForm } from "@/components";
import { answers, articles, media, pathways, scriptures, topics } from "@/data";
import { buildAppUrl } from "@/urls";

export default function HomePage() {
  const featuredPathway = pathways[0];
  const scripture = scriptures.find((item) => item.reference === "John 14:9–11") ?? scriptures[0];
  const featuredTopics = topics.slice(0, 5);
  const featuredArticles = articles.slice(0, 3);

  return (
    <div className="home-v2">
      <section className="home-cinematic-hero">
        <div className="shell home-cinematic-grid">
          <div className="home-cinematic-copy">
            <span className="street-mark">Scripture first. Questions welcome.</span>
            <h1>Know what you believe.<span>Know why.</span></h1>
            <p>Search Scripture, follow connected passages, explore Apostolic doctrine, and build a clearer understanding of God&apos;s Word.</p>
            <div className="home-cinematic-actions">
              <Link className="button button-crimson" href="#search-demo">Search Scripture <Search size={17} /></Link>
              <Link className="button button-outline" href="/topics">Explore topics <ArrowRight size={17} /></Link>
            </div>
            <div className="home-cinematic-proof" aria-label="Apostolic Guide principles">
              <span><Check size={15} /> Scripture in context</span>
              <span><Check size={15} /> Direct answers</span>
              <span><Check size={15} /> Connected pathways</span>
            </div>
          </div>

          <div className="home-cinematic-visual" aria-label="A person studying an open Bible with notes">
            <div className="home-cinematic-photo" />
            <div className="home-query-chip"><Search size={17} /> Why did Jesus pray if he is God?</div>
            <div className="home-proof-card" data-reveal>
              <span>Direct answer</span>
              <h2>His prayers reveal genuine humanity.</h2>
              <p>They do not erase the Father dwelling, speaking, and working in him.</p>
              <footer><span>John 14:9–11</span><span>Follow the evidence →</span></footer>
            </div>
            <span className="home-cinematic-caption">Photo: Tima Miroshnichenko / Pexels</span>
          </div>
        </div>
      </section>

      <section className="home-section home-product-section" id="search-demo">
        <div className="shell">
          <div className="home-section-heading">
            <div><span className="street-mark">The search experience</span><h2>Start with the question in front of you.</h2></div>
            <p>Giga proves its product by showing the interface. Apostolic Guide should do the same. The search surface now becomes a central homepage moment, not a small input floating between sections.</p>
          </div>

          <div className="home-product-frame" data-reveal>
            <aside className="product-sidebar">
              <div className="product-sidebar-logo"><BookOpen size={17} /> APOSTOLIC GUIDE</div>
              <div className="product-nav">
                <span className="active"><Search size={15} /> Search</span>
                <span><BookOpen size={15} /> Scripture</span>
                <span><Compass size={15} /> Topics</span>
                <span><Route size={15} /> Pathways</span>
              </div>
              <div className="product-sidebar-note">Every result should tell you why it matched, what the passage proves, and where to go next.</div>
            </aside>

            <div className="product-main">
              <header className="product-topbar"><strong>Search the Scriptures</strong><span>Curated Apostolic reference library</span></header>
              <div className="product-canvas">
                <div className="product-search-area">
                  <div className="product-search-box"><Search size={18} /><span>Is Jesus God?</span><b>SEARCH</b></div>
                  <article className="product-result">
                    <div className="product-result-head"><span>Best match · Scripture</span><small>John 14:9–11 KJV</small></div>
                    <h3>The Father is revealed through the Son.</h3>
                    <blockquote>“He that hath seen me hath seen the Father... the Father that dwelleth in me, he doeth the works.”</blockquote>
                    <p>Jesus does not point Philip away from himself to see another divine person. He explains the Father&apos;s indwelling presence and works in him.</p>
                    <div className="product-result-footer"><span>Why this matched</span><span>Open passage →</span></div>
                  </article>
                </div>

                <aside className="product-connections">
                  <strong>Connected evidence</strong>
                  <div className="product-connection"><strong>Colossians 2:9</strong><span>The fullness of the Godhead dwells bodily in Christ.</span></div>
                  <div className="product-connection"><strong>2 Corinthians 5:19</strong><span>God was in Christ reconciling the world unto himself.</span></div>
                  <div className="product-connection"><strong>1 Timothy 3:16</strong><span>God was manifest in the flesh.</span></div>
                </aside>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 28 }}><SearchForm /></div>
        </div>
      </section>

      <section className="home-manifesto-v2">
        <div className="home-manifesto-grid">
          <div className="home-manifesto-photo"><span>Photo: Jessika Arraes / Pexels</span></div>
          <div className="home-manifesto-copy" data-reveal>
            <span className="street-mark">Why Apostolic Guide exists</span>
            <blockquote>Truth deserves to be <em>understood</em>, not merely repeated.</blockquote>
            <p>Every claim should be traceable to the text, explainable in context, and strong enough to answer the real question. The site should feel like entering a serious study environment, not browsing a ministry template.</p>
            <Link className="text-link" href="/about">Read our approach <ArrowUpRight size={18} /></Link>
          </div>
        </div>
      </section>

      <section className="home-section home-question-index">
        <div className="shell">
          <div className="home-section-heading">
            <div><span className="street-mark">Start with the objection</span><h2>Direct answers without dodging the text.</h2></div>
            <p>The question index is intentionally compact. It should feel fast and useful, not like a stack of oversized white cards.</p>
          </div>
          <div className="question-index-grid">
            {answers.slice(0, 6).map((answer, index) => (
              <Link className="question-index-row" href={`/answers/${answer.slug}`} key={answer.slug} data-reveal>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <h3>{answer.question}</h3>
                <p>{answer.shortAnswer}</p>
                <ArrowRight size={19} />
              </Link>
            ))}
          </div>
          <Link className="text-link" href="/answers" style={{ marginTop: 28 }}>See all answers <ArrowRight size={16} /></Link>
        </div>
      </section>

      <section className="home-section home-topic-bento-section">
        <div className="shell">
          <div className="home-section-heading">
            <div><span className="street-mark">Doctrine library</span><h2>The whole biblical case, not isolated proof texts.</h2></div>
            <p>Each topic gets a different scale and visual weight. The homepage now feels curated rather than generated from one repeating card component.</p>
          </div>
          <div className="topic-bento-grid">
            {featuredTopics.map((topic) => (
              <Link className="topic-bento-card" href={`/topics/${topic.slug}`} key={topic.slug} data-reveal>
                <span className="eyebrow">{topic.category}</span>
                <span className="topic-bento-word" aria-hidden>{topic.accent}</span>
                <h3>{topic.title}</h3>
                <p>{topic.claim}</p>
                <span className="text-link">Explore topic <ArrowRight size={16} /></span>
              </Link>
            ))}
          </div>
          <Link className="text-link" href="/topics" style={{ marginTop: 28 }}>Browse all topics <ArrowRight size={16} /></Link>
        </div>
      </section>

      <section className="home-section home-pathway-story">
        <div className="shell pathway-story-grid">
          <div className="pathway-story-copy" data-reveal>
            <span className="street-mark">Guided Scripture pathway</span>
            <h2>{featuredPathway.title}</h2>
            <p>{featuredPathway.summary}</p>
            <div className="pathway-story-meta">
              <span>{featuredPathway.steps.length} connected passages</span>
              <span>{featuredPathway.estimatedMinutes} minute study</span>
              <span>{featuredPathway.level}</span>
            </div>
            <Link className="button button-paper" href={`/pathways/${featuredPathway.slug}`}>Begin pathway <ArrowRight size={17} /></Link>
          </div>

          <div className="pathway-ui" data-reveal>
            <aside className="pathway-ui-rail">
              <strong>PATH</strong>
              {featuredPathway.steps.map((step, index) => <span className={`pathway-ui-step-dot ${index === 1 ? "active" : ""}`} key={step.reference}>{index + 1}</span>)}
            </aside>
            <div className="pathway-ui-main">
              <span>Step 02 · The revelation</span>
              <h3>The Father made visible.</h3>
              <p>Follow the argument one passage at a time instead of collecting disconnected verses.</p>
              <div className="pathway-passage">
                <header><span>John 14:9–11</span><span>Step 2 of {featuredPathway.steps.length}</span></header>
                <blockquote>“He that hath seen me hath seen the Father...”</blockquote>
                <footer><span>Previous: The invisible God</span><span>Next: God in Christ →</span></footer>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="home-scripture-image">
        <div className="shell home-scripture-overlay" data-reveal>
          <span className="street-mark">Scripture spotlight · {scripture.reference}</span>
          <blockquote>“{scripture.text}”</blockquote>
          <p>{scripture.mainPoint}</p>
          <Link className="text-link" href={`/scripture/${scripture.path}`}>Study this passage <ArrowRight size={16} /></Link>
        </div>
      </section>

      <section className="home-section home-app-demo">
        <div className="shell app-demo-grid">
          <div className="app-demo-devices" data-reveal aria-label="Apostolic Guide app interface preview">
            <div className="app-device app-device-desktop">
              <div className="app-device-bar"><i /><i /><i /></div>
              <div className="app-device-canvas">
                <aside className="app-device-nav"><strong>APOSTOLIC GUIDE</strong><span className="active">Search</span><span>Topics</span><span>Pathways</span><span>Workspace</span></aside>
                <div className="app-device-content">
                  <span>Conversation mode</span>
                  <h3>Why did Jesus pray?</h3>
                  <div className="app-study-card"><strong>Direct answer</strong><small>Because the incarnation includes genuine humanity. Prayer demonstrates the Son&apos;s human life and dependence without denying the deity dwelling in him.</small></div>
                  <div className="app-study-card"><strong>John 14:10</strong><small>“The Father that dwelleth in me, he doeth the works.”</small></div>
                  <div className="app-study-card"><strong>Hebrews 5:7</strong><small>The prayers belong to “the days of his flesh.”</small></div>
                </div>
              </div>
            </div>
            <div className="app-device app-device-phone">
              <div className="phone-notch" />
              <div className="phone-content"><span>Quick reference</span><h4>Jesus is God</h4><div className="phone-result"><strong>Colossians 2:9</strong><small>All the fullness of the Godhead dwells in Christ bodily.</small></div></div>
            </div>
          </div>

          <div className="app-demo-copy" data-reveal>
            <span className="street-mark">The study app</span>
            <h2>Show the product. Prove the promise.</h2>
            <p>The website introduces the universe. The app carries the deeper work: fast retrieval, guided pathways, connected passages, conversation preparation, saved studies, and presentation tools.</p>
            <div className="app-demo-features">
              <div className="app-demo-feature"><span>01</span><div><strong>Fast Scripture search</strong><small>Find the text by reference, phrase, doctrine, or objection.</small></div></div>
              <div className="app-demo-feature"><span>02</span><div><strong>Guided pathways</strong><small>Move through the argument in order instead of jumping between isolated verses.</small></div></div>
              <div className="app-demo-feature"><span>03</span><div><strong>Conversation tools</strong><small>Prepare concise answers and open the next passage without losing the thread.</small></div></div>
            </div>
            <a className="button button-dark" href={buildAppUrl("/", { placement: "home-product-demo" })}>Open Apostolic Guide App <ArrowUpRight size={17} /></a>
          </div>
        </div>
      </section>

      <section className="home-section home-editorial-section">
        <div className="shell">
          <div className="home-section-heading">
            <div><span className="street-mark">Editorial + media</span><h2>Read the argument. Watch the explanation. Hear the declaration.</h2></div>
            <p>This section changes scale again, borrowing Noon&apos;s editorial rhythm instead of repeating the same content card three times.</p>
          </div>

          <div className="editorial-grid-v2">
            {featuredArticles[0] && (
              <Link className="editorial-feature" href={`/articles/${featuredArticles[0].slug}`} data-reveal>
                <span className="eyebrow eyebrow-light">{featuredArticles[0].eyebrow}</span>
                <h3>{featuredArticles[0].title}</h3>
                <p>{featuredArticles[0].summary}</p>
                <span className="text-link">Read article <ArrowRight size={16} /></span>
              </Link>
            )}
            {featuredArticles.slice(1).map((article) => (
              <Link className="editorial-small" href={`/articles/${article.slug}`} key={article.slug} data-reveal>
                <span className="eyebrow">{article.eyebrow}</span>
                <h3>{article.title}</h3>
                <p>{article.summary}</p>
                <span className="text-link">Read article <ArrowRight size={16} /></span>
              </Link>
            ))}
          </div>

          <div className="home-media-strip">
            {media.slice(0, 3).map((item, index) => (
              <article key={item.slug} data-reveal>
                <span className="eyebrow">{item.type} · {item.duration}</span>
                <h4>{item.title}</h4>
                <p>{item.summary}</p>
                <span style={{ marginTop: 18 }}>{index === 0 ? <Play size={18} /> : index === 1 ? <Sparkles size={18} /> : <BookOpen size={18} />}</span>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="home-section home-belief-manifesto">
        <div className="shell belief-manifesto-grid">
          <span className="street-mark">What we believe</span>
          <div className="belief-lines" data-reveal>
            <p>God is one.</p>
            <p>Jesus Christ is God revealed in genuine humanity.</p>
            <p>Scripture leads the conversation.</p>
            <Link className="text-link" href="/beliefs">Read the full statement <ArrowRight size={17} /></Link>
          </div>
        </div>
      </section>

      <section className="home-section home-v2-final">
        <div className="shell home-v2-final-grid">
          <div><span className="street-mark">Continue the study</span><h2>Open the text.<br />Follow the evidence.</h2></div>
          <div className="home-v2-final-actions">
            <Link className="button button-paper" href="/scripture">Browse Scripture <BookOpen size={17} /></Link>
            <a className="button button-outline" href={buildAppUrl("/", { placement: "home-final-v2" })}>Open the app <ArrowUpRight size={17} /></a>
          </div>
        </div>
      </section>
    </div>
  );
}
