import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Clock3 } from "lucide-react";
import { notFound } from "next/navigation";
import { AppBridge, ContentBody, DatabaseDocument } from "@/components";
import { extractScriptureReferences, StudyScriptures } from "@/study-guidance";
import { ShareButton } from "@/share-button";
import { SmartNext } from "@/smart-next";
import { articleSuggestions } from "@/suggestion-data";
import { articleBySlug, articles, topicBySlug } from "@/data";
import { getDatabaseContent } from "@/database-content";
import { absoluteWebsiteUrl, breadcrumbJsonLd, buildSeoMetadata, defaultSeoImage } from "@/seo";
import { SearchIntentCluster } from "@/search-intent-cluster";
import { canonicalWebsiteUrl } from "@/urls";

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return articles.map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const local = articleBySlug(slug);
  const database = local ? null : await getDatabaseContent("article", slug);
  if (!local && !database) return {};
  return buildSeoMetadata({
    title: local?.title ?? database!.title,
    description: local?.summary ?? database!.summary,
    path: `/articles/${slug}`,
    type: "article"
  });
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  const local = articleBySlug(slug);
  const database = local ? null : await getDatabaseContent("article", slug);
  if (!local && !database) notFound();

  const currentPath = `/articles/${slug}`;
  const title = local?.title ?? database!.title;
  const summary = local?.summary ?? database!.summary;
  const topic = local ? topicBySlug(local.topicSlug) : null;
  const references = local
    ? Array.from(new Set([
        ...local.sections.flatMap((section) => section.scripture ? [section.scripture.reference] : []),
        ...extractScriptureReferences(local.sections)
      ]))
    : extractScriptureReferences([database!.summary, database!.body]);
  const issue = String(Math.max(1, articles.findIndex((article) => article.slug === slug) + 1)).padStart(2, "0");
  const suggestions = articleSuggestions(slug);
  const conclusionText = topic
    ? `The passages in this study establish the central claim clearly: ${topic.claim} Read the surrounding chapters, compare every connected passage, and let the explicit testimony of Scripture control the conclusion.`
    : `The evidence in this study reaches a clear biblical conclusion. Read the surrounding chapters, compare every connected passage, and let the explicit testimony of Scripture control the conclusion.`;
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description: summary,
    image: absoluteWebsiteUrl(defaultSeoImage),
    author: { "@type": "Organization", name: "Apostolic Guide", url: canonicalWebsiteUrl },
    publisher: { "@type": "Organization", name: "Apostolic Guide", url: canonicalWebsiteUrl, logo: { "@type": "ImageObject", url: `${canonicalWebsiteUrl}/icons/icon-512.png` } },
    mainEntityOfPage: absoluteWebsiteUrl(currentPath),
    datePublished: local?.publishedAt ?? database?.publishedAt,
    dateModified: database?.updatedAt ?? local?.publishedAt
  };
  const breadcrumbs = breadcrumbJsonLd([
    { name: "Articles", path: "/articles" },
    { name: title, path: currentPath }
  ]);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }} />
      <article className="article-page">
        <header className="article-header ei-article-header">
          <div className="shell article-header-inner ei-article-header-inner">
            <div className="ei-article-header-meta">
              <Link className="back-link" href="/articles"><ArrowLeft size={16} /> All studies</Link>
              <span>Study / {issue}</span>
            </div>
            <span className="eyebrow eyebrow-light">{local?.eyebrow ?? "Published study"}</span>
            <h1>{title}</h1>
            <p>{summary}</p>
            <div className="article-byline">
              <span>Apostolic Guide</span>
              {local && <span><Clock3 size={15} /> {local.readingMinutes} min read</span>}
              {topic && <Link href={`/topics/${topic.slug}`}>{topic.title}</Link>}
              <ShareButton title={title} contentKey={`article:${slug}`} />
            </div>
            <span className="ei-article-watermark" aria-hidden>{issue}</span>
          </div>
        </header>
        <div className="shell reading-layout">
          <aside className="reading-aside">
            <strong>In this study</strong>
            {(local?.sections ?? []).map((section) => section.heading && <a key={section.heading} href={`#${section.heading.toLowerCase().replaceAll(" ", "-")}`}>{section.heading}</a>)}
            {topic && <Link href={`/topics/${topic.slug}`}>Explore {topic.title}</Link>}
          </aside>
          <div>
            {local ? <ContentBody sections={local.sections} /> : <DatabaseDocument body={database!.body} />}
            <section className="article-conclusion" aria-labelledby={`article-conclusion-${slug}`} data-reveal>
              <span className="article-conclusion-kicker">Conclusion</span>
              <h2 id={`article-conclusion-${slug}`}>What this study establishes.</h2>
              <p><strong>{conclusionText}</strong></p>
              <div className="article-conclusion-actions">
                {topic && <Link className="article-conclusion-link" href={`/topics/${topic.slug}`}>Explore {topic.title}<ArrowRight size={16} /></Link>}
                <a className="article-conclusion-link" href="#study-the-scriptures">Open the passages<ArrowRight size={16} /></a>
              </div>
            </section>
            <div id="study-the-scriptures">
              <StudyScriptures references={references} />
            </div>
            <SearchIntentCluster currentPath={currentPath} />
            <AppBridge compact origin={`article:${slug}`} />
            <SmartNext
              currentPath={currentPath}
              candidates={suggestions}
              eyebrow="Continue reading"
              heading="Read the next article."
              intro="Move through the studies as a connected series, then branch into the pathway or question that helps most."
              primaryLabel="Read next article"
            />
          </div>
        </div>
      </article>
    </>
  );
}
