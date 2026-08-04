import type { MetadataRoute } from "next";
import { answers, articles, pathways, scriptures, topics } from "@/data";
import { listDatabaseContent } from "@/database-content";
import { websiteUrl } from "@/urls";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const databaseItems = await listDatabaseContent();
  const fixed: Array<{ path: string; priority: number; changeFrequency: "weekly" | "monthly" }> = [
    { path: "", priority: 1, changeFrequency: "weekly" },
    { path: "/topics", priority: .9, changeFrequency: "weekly" },
    { path: "/answers", priority: .9, changeFrequency: "weekly" },
    { path: "/scripture", priority: .9, changeFrequency: "weekly" },
    { path: "/pathways", priority: .85, changeFrequency: "weekly" },
    { path: "/articles", priority: .85, changeFrequency: "weekly" },
    { path: "/how-it-works", priority: .82, changeFrequency: "monthly" },
    { path: "/media", priority: .7, changeFrequency: "monthly" },
    { path: "/beliefs", priority: .8, changeFrequency: "monthly" },
    { path: "/about", priority: .6, changeFrequency: "monthly" },
    { path: "/links", priority: .4, changeFrequency: "monthly" },
    { path: "/contact", priority: .4, changeFrequency: "monthly" },
    { path: "/privacy", priority: .2, changeFrequency: "monthly" },
    { path: "/terms", priority: .2, changeFrequency: "monthly" }
  ];

  const localUrls = new Set([
    ...topics.map((item) => `/topics/${item.slug}`),
    ...answers.map((item) => `/answers/${item.slug}`),
    ...articles.map((item) => `/articles/${item.slug}`)
  ]);

  const databasePages: MetadataRoute.Sitemap = databaseItems.flatMap((item) => {
    const section = item.kind === "article" ? "articles" : item.kind === "answer" ? "answers" : item.kind === "topic" ? "topics" : null;
    if (!section) return [];
    const path = `/${section}/${item.slug}`;
    return localUrls.has(path) ? [] : [{
      url: `${websiteUrl}${path}`,
      lastModified: item.updatedAt,
      changeFrequency: "weekly" as const,
      priority: .72
    }];
  });

  return [
    ...fixed.map((item) => ({ url: `${websiteUrl}${item.path}`, changeFrequency: item.changeFrequency, priority: item.priority })),
    ...topics.map((item) => ({ url: `${websiteUrl}/topics/${item.slug}`, changeFrequency: "monthly" as const, priority: .82 })),
    ...answers.map((item) => ({ url: `${websiteUrl}/answers/${item.slug}`, changeFrequency: "monthly" as const, priority: .8 })),
    ...articles.map((item) => ({ url: `${websiteUrl}/articles/${item.slug}`, lastModified: item.publishedAt, changeFrequency: "monthly" as const, priority: .76 })),
    ...scriptures.map((item) => ({ url: `${websiteUrl}/scripture/${item.path}`, changeFrequency: "monthly" as const, priority: .78 })),
    ...pathways.map((item) => ({ url: `${websiteUrl}/pathways/${item.slug}`, changeFrequency: "monthly" as const, priority: .78 })),
    ...databasePages
  ];
}
