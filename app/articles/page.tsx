import type { Metadata } from "next";
import { articles } from "@/data";
import { PageHero } from "@/components";
import { ArticlePoster } from "@/article-poster";
import { listDatabaseContent } from "@/database-content";

export const metadata: Metadata = {
  title: "Articles",
  description: "Bible studies, doctrinal explanations, passage breakdowns, and direct responses from Apostolic Guide."
};

export default async function ArticlesPage() {
  const databaseArticles = await listDatabaseContent("article");

  return (
    <>
      <PageHero
        eyebrow="Long-form study"
        title="Articles"
        text="Bible studies, passage breakdowns, doctrinal explanations, and direct responses built to be checked against Scripture."
      />
      <section className="section ei-article-library">
        <div className="shell ei-library-header">
          <span>AG / STUDY LIBRARY</span>
          <span>{databaseArticles.length + articles.length} PUBLISHED STUDIES</span>
        </div>
        <div className="shell ei-poster-grid ei-poster-grid-library">
          {databaseArticles.map((article, index) => (
            <ArticlePoster
              key={article.id}
              slug={article.slug}
              title={article.title}
              eyebrow="Published study"
              summary={article.summary}
              index={index}
            />
          ))}
          {articles.map((article, index) => (
            <ArticlePoster
              key={article.slug}
              slug={article.slug}
              title={article.title}
              eyebrow={article.eyebrow}
              summary={article.summary}
              readingMinutes={article.readingMinutes}
              index={databaseArticles.length + index}
            />
          ))}
        </div>
      </section>
    </>
  );
}
