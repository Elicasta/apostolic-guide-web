import type { MetadataRoute } from "next";
import { answers, articles, scriptures, topics } from "@/data";
import { allPathways } from "@/pathway-catalog";
import { listDatabaseContent } from "@/database-content";
import { canonicalWebsiteUrl } from "@/urls";

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
    { path: "/subscribe", priority: .4, changeFrequency: "monthly" },
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
      url: `${canonicalWebsiteUrl}${path}`,
      lastModified: item.updatedAt,
      changeFrequency: "weekly" as const,
      priority: .72
    }];
  });

  return [
    ...fixed.map((item) => ({ url: `${canonicalWebsiteUrl}${item.path}`, changeFrequency: item.changeFrequency, priority: item.priority })),
    ...topics.map((item) => ({ url: `${canonicalWebsiteUrl}/topics/${item.slug}`, changeFrequency: "monthly" as const, priority: .82 })),
    ...answers.map((item) => ({ url: `${canonicalWebsiteUrl}/answers/${item.slug}`, changeFrequency: "monthly" as const, priority: .8 })),
    ...articles.map((item) => ({ url: `${canonicalWebsiteUrl}/articles/${item.slug}`, lastModified: item.publishedAt, changeFrequency: "monthly" as const, priority: .76 })),
    ...scriptures.map((item) => ({ url: `${canonicalWebsiteUrl}/scripture/${item.path}`, changeFrequency: "monthly" as const, priority: .78 })),
    ...allPathways.map((item) => ({ url: `${canonicalWebsiteUrl}/pathways/${item.slug}`, changeFrequency: "monthly" as const, priority: .8 })),
    ...databasePages
  ];
}
