import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Suspense } from "react";
import { SiteFooter, SiteHeader } from "@/components";
import { ProductAnalytics } from "@/analytics";
import { websiteUrl } from "@/urls";
import "./globals.css";
import "./public-routes.css";

export const metadata: Metadata = {
  metadataBase: new URL(websiteUrl),
  title: { default: "Apostolic Guide", template: "%s | Apostolic Guide" },
  description: "A Scripture-first library about the one God, Jesus Christ, salvation, and the apostolic faith.",
  applicationName: "Apostolic Guide",
  openGraph: {
    title: "Apostolic Guide",
    description: "Search the Scriptures. Know what you believe.",
    type: "website",
    siteName: "Apostolic Guide"
  },
  twitter: {
    card: "summary_large_image",
    title: "Apostolic Guide",
    description: "Scripture · Doctrine · Answers"
  },
  icons: { icon: "/favicon.png", apple: "/icons/icon-192.png" },
  alternates: { types: { "application/rss+xml": "/feed.xml" } }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">Skip to content</a>
        <SiteHeader />
        <main id="main-content">{children}</main>
        <SiteFooter />
        <Suspense fallback={null}><ProductAnalytics /></Suspense>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
