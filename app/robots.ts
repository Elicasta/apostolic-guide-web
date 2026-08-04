import type { MetadataRoute } from "next";
import { websiteUrl } from "@/urls";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin/", "/api/", "/auth/", "/login/"]
    },
    sitemap: `${websiteUrl}/sitemap.xml`,
    host: websiteUrl
  };
}
