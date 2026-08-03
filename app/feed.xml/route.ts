import { articles } from "@/data";
import { listDatabaseContent } from "@/database-content";
import { websiteUrl } from "@/urls";

function escapeXml(value: string) {
  return value.replace(/[<>&'\"]/g, (character) => ({
    "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", "\"": "&quot;"
  })[character] ?? character);
}

export async function GET() {
  const databaseArticles = await listDatabaseContent("article");
  const localSlugs = new Set(articles.map((article) => article.slug));
  const items = [
    ...databaseArticles.filter((article) => !localSlugs.has(article.slug)).map((article) => ({
      title: article.title,
      summary: article.summary,
      slug: article.slug,
      publishedAt: article.publishedAt ?? new Date().toISOString()
    })),
    ...articles.map((article) => ({
      title: article.title,
      summary: article.summary,
      slug: article.slug,
      publishedAt: article.publishedAt
    }))
  ].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));

  const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0">
  <channel>
    <title>Apostolic Guide</title>
    <link>${websiteUrl}</link>
    <description>Scripture-first articles about the one God, Jesus Christ, salvation, and the apostolic faith.</description>
    ${items.map((item) => `<item>
      <title>${escapeXml(item.title)}</title>
      <link>${websiteUrl}/articles/${item.slug}</link>
      <guid>${websiteUrl}/articles/${item.slug}</guid>
      <description>${escapeXml(item.summary)}</description>
      <pubDate>${new Date(item.publishedAt).toUTCString()}</pubDate>
    </item>`).join("\n")}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400"
    }
  });
}
