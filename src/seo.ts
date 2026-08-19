import type { Metadata } from "next";
import { canonicalWebsiteUrl } from "./urls";

export const defaultSeoImage = "/opengraph-image?v=20260812";

type SeoPageType = "website" | "article";

type SeoMetadataInput = {
  title: string;
  description: string;
  path: string;
  type?: SeoPageType;
};

export function absoluteWebsiteUrl(path = "/") {
  return new URL(path, `${canonicalWebsiteUrl}/`).toString();
}

export function buildSeoMetadata({ title, description, path, type = "website" }: SeoMetadataInput): Metadata {
  const canonicalPath = path.startsWith("/") ? path : `/${path}`;
  return {
    title,
    description,
    alternates: { canonical: canonicalPath },
    openGraph: {
      title,
      description,
      type,
      siteName: "Apostolic Guide",
      locale: "en_US",
      url: absoluteWebsiteUrl(canonicalPath),
      images: [{
        url: defaultSeoImage,
        width: 1200,
        height: 630,
        alt: `${title} | Apostolic Guide`
      }]
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [defaultSeoImage]
    }
  };
}

export type BreadcrumbItem = { name: string; path: string };

export function breadcrumbJsonLd(items: BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteWebsiteUrl(item.path)
    }))
  };
}
