import type { MetadataRoute } from "next";
import { answers, articles, pathways, scriptures, topics } from "@/data";
import { listDatabaseContent } from "@/database-content";
import { websiteUrl } from "@/urls";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const databaseItems = await listDatabaseContent();
  const fixed = ["", "/topics", "/answers", "/articles", "/scripture", "/pathways", "/media", "/beliefs", "/about", "/links", "/contact", "/privacy", "/terms"];
  const localUrls = new Set([
    ...topics.map((item) => `/topics/${item.slug}`),
    ...answers.map((item) => `/answers/${item.slug}`),
    ...articles.map((item) => `/articles/${item.slug}`)
  ]);
  const databasePages = databaseItems.flatMap((item) => {
    const section = item.kind === "article" ? "articles" : item.kind === "answer" ? "answers" : item.kind === "topic" ? "topics" : null;
    if (!section) return [];
    const path = `/${section}/${item.slug}`;
    return localUrls.has(path) ? [] : [{
      url: `${websiteUrl}${path}`,
      lastModified: item.updatedAt,
      changeFrequency: "weekly" as const
    }];
  });

  return [
    ...fixed.map((path) => ({ url: `${websiteUrl}${path}`, changeFrequency: "weekly" as const })),
    ...topics.map((item) => ({ url: `${websiteUrl}/topics/${item.slug}`, changeFrequency: "monthly" as const })),
    ...answers.map((item) => ({ url: `${websiteUrl}/answers/${item.slug}`, changeFrequency: "monthly" as const })),
    ...articles.map((item) => ({ url: `${websiteUrl}/articles/${item.slug}`, lastModified: item.publishedAt, changeFrequency: "monthly" as const })),
    ...scriptures.map((item) => ({ url: `${websiteUrl}/scripture/${item.path}`, changeFrequency: "monthly" as const })),
    ...pathways.map((item) => ({ url: `${websiteUrl}/pathways/${item.slug}`, changeFrequency: "monthly" as const })),
    ...databasePages
  ];
}
