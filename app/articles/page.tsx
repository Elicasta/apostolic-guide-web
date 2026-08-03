import type { Metadata } from "next";
import { articles } from "@/data";
import { ArticleCard, PageHero } from "@/components";
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
      <section className="section">
        <div className="shell">
          <div className="article-index-grid">
            {databaseArticles.map((article) => (
              <a className="article-card" href={`/articles/${article.slug}`} key={article.id}>
                <span className="eyebrow">Published study</span>
                <h3>{article.title}</h3>
                <p>{article.summary}</p>
                <span className="card-meta">From the editorial library</span>
              </a>
            ))}
            {articles.map((article) => <ArticleCard article={article} key={article.slug} />)}
          </div>
        </div>
      </section>
    </>
  );
}
