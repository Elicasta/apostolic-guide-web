import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Clock3 } from "lucide-react";
import { notFound } from "next/navigation";
import { AppBridge, ContentBody, DatabaseDocument } from "@/components";
import { BrandCrown } from "@/brand-marks";
import { ShareButton } from "@/share-button";
import { articleBySlug, articles, topicBySlug } from "@/data";
import { getDatabaseContent } from "@/database-content";
import { websiteUrl } from "@/urls";

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return articles.map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const local = articleBySlug(slug);
  const database = local ? null : await getDatabaseContent("article", slug);
  if (!local && !database) return {};
  return {
    title: local?.title ?? database?.title,
    description: local?.summary ?? database?.summary
  };
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  const local = articleBySlug(slug);
  const database = local ? null : await getDatabaseContent("article", slug);
  if (!local && !database) notFound();

  const title = local?.title ?? database!.title;
  const summary = local?.summary ?? database!.summary;
  const topic = local ? topicBySlug(local.topicSlug) : null;
  const issue = String(Math.max(1, articles.findIndex((article) => article.slug === slug) + 1)).padStart(2, "0");
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description: summary,
    author: { "@type": "Organization", name: "Apostolic Guide" },
    publisher: { "@type": "Organization", name: "Apostolic Guide", url: websiteUrl },
    mainEntityOfPage: `${websiteUrl}/articles/${slug}`,
    datePublished: local?.publishedAt ?? database?.publishedAt,
    dateModified: database?.updatedAt ?? local?.publishedAt
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <article className="article-page">
        <header className="article-header ei-article-header">
          <div className="shell article-header-inner ei-article-header-inner">
            <div className="ei-article-header-meta">
              <Link className="back-link" href="/articles"><ArrowLeft size={16} /> All studies</Link>
              <span>AG / STUDY {issue}</span>
            </div>
            <BrandCrown className="ag-article-crown" />
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
            <AppBridge compact origin={`article:${slug}`} />
          </div>
        </div>
      </article>
    </>
  );
}
