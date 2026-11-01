import type { MetadataRoute } from "next";
import { canonicalWebsiteUrl } from "@/urls";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin/", "/api/", "/auth/", "/login/"]
    },
    sitemap: `${canonicalWebsiteUrl}/sitemap.xml`,
    host: canonicalWebsiteUrl
  };
}
