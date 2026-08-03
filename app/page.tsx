import Link from "next/link";
import { ArrowRight, BookOpen, CircleHelp, FileText, Route } from "lucide-react";
import { AppBridge, ArticleCard, ScriptureMiniCard, SearchForm, SectionHeading, TopicCard } from "@/components";
import { answers, articles, pathways, scriptures, topics } from "@/data";

export default function HomePage() {
  const featuredTopics = topics.slice(0, 6);
  const featuredAnswers = answers.slice(0, 4);
  const featuredArticles = articles.slice(0, 3);
  const featuredScriptures = scriptures.slice(0, 4);

  return (
    <>
      <section className="hero">
        <div className="shell hero-inner">
          <div className="hero-copy">
            <span className="eyebrow">Scripture · Doctrine · Answers</span>
            <h1>Search the Scriptures. <span>Know what you believe.</span></h1>
            <p className="hero-lede">A Scripture-first library built to help you find the passage, follow the biblical case, answer the objection, and explain the apostolic faith clearly.</p>
            <div className="hero-actions">
              <Link className="button button-crimson" href="/topics">Explore topics <ArrowRight size={17} /></Link>
              <Link className="button button-outline" href="/beliefs">What we believe</Link>
            </div>
          </div>
          <aside className="hero-side" aria-label="Apostolic Guide mission">
            <div className="hero-watermark" aria-hidden>ONE</div>
            <div className="hero-statement">
              <strong>John 5:39</strong>
              <blockquote>“Search the scriptures.”</blockquote>
              <span>Truth should be traced through the text, not merely repeated.</span>
            </div>
          </aside>
        </div>
      </section>

      <div className="shell search-band">
        <SearchForm />
        <div className="search-suggestions"><span>Try:</span><Link href="/search?q=John+14%3A9">John 14:9</Link><Link href="/search?q=Why+did+Jesus+pray%3F">Why did Jesus pray?</Link><Link href="/search?q=baptism+in+Jesus+name">Baptism in Jesus&apos; name</Link></div>
      </div>

      <section className="section section-after-search">
        <div className="shell">
          <SectionHeading eyebrow="Start with the doctrine" title="Core biblical topics" text="Each topic connects the central claim to Scripture, direct answers, related studies, and guided pathways." href="/topics" />
          <div className="topic-grid">{featuredTopics.map((topic) => <TopicCard key={topic.slug} topic={topic} />)}</div>
        </div>
      </section>

      <section className="section section-dark">
        <div className="shell home-study-grid">
          <div>
            <span className="eyebrow eyebrow-light">Follow the case</span>
            <h2>Study in a sequence, not in fragments.</h2>
            <p>Pathways move from first principles to key passages and common questions. Each step tells you what the text contributes to the whole argument.</p>
            <Link className="button button-paper" href="/pathways">Browse pathways <ArrowRight size={17} /></Link>
          </div>
          <div className="home-pathway-list">
            {pathways.map((pathway, index) => (
              <Link href={`/pathways/${pathway.slug}`} key={pathway.slug}>
                <span>0{index + 1}</span><div><strong>{pathway.title}</strong><small>{pathway.estimatedMinutes} min · {pathway.level}</small></div><ArrowRight size={17} />
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="shell">
          <SectionHeading eyebrow="Questions welcomed" title="Direct answers" text="Begin with the actual question, then examine the passages behind the answer." href="/answers" />
          <div className="question-grid">
            {featuredAnswers.map((answer) => (
              <Link className="question-card" href={`/answers/${answer.slug}`} key={answer.slug}>
                <CircleHelp size={21} /><h3>{answer.question}</h3><p>{answer.shortAnswer}</p><span className="text-link">Read the answer <ArrowRight size={16} /></span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="section section-soft">
        <div className="shell scripture-focus">
          <div>
            <span className="eyebrow">Open the text</span>
            <h2>Scripture pages built for explanation.</h2>
            <p>Each entry gives the text, context, main point, apostolic connection, related passages, and the misunderstanding to avoid.</p>
            <Link className="text-link" href="/scripture">Browse Scripture <ArrowRight size={16} /></Link>
          </div>
          <div className="scripture-stack">{featuredScriptures.map((entry) => <ScriptureMiniCard key={entry.slug} reference={entry.reference} point={entry.mainPoint} href={`/scripture/${entry.path}`} />)}</div>
        </div>
      </section>

      <section className="section">
        <div className="shell">
          <SectionHeading eyebrow="Read deeper" title="Latest studies" text="Long-form explanations that make the reasoning visible and keep the biblical context intact." href="/articles" />
          <div className="article-grid">{featuredArticles.map((article, index) => <ArticleCard article={article} large={index === 0} key={article.slug} />)}</div>
        </div>
      </section>

      <section className="section section-tight">
        <div className="shell home-entry-grid">
          <Link href="/topics"><BookOpen size={23} /><div><strong>{topics.length} topics</strong><span>Doctrine organized around biblical claims.</span></div></Link>
          <Link href="/answers"><CircleHelp size={23} /><div><strong>{answers.length} answers</strong><span>Questions addressed directly from Scripture.</span></div></Link>
          <Link href="/articles"><FileText size={23} /><div><strong>{articles.length} studies</strong><span>Long-form teaching and passage breakdowns.</span></div></Link>
          <Link href="/pathways"><Route size={23} /><div><strong>{pathways.length} pathways</strong><span>Guided sequences for focused study.</span></div></Link>
        </div>
      </section>

      <section className="section section-tight"><div className="shell"><AppBridge origin="homepage" /></div></section>
    </>
  );
}
