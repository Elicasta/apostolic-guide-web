import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Suspense } from "react";
import { SiteFooter, SiteHeader } from "@/components";
import { ProductAnalytics } from "@/analytics";
import { GlobalBackNav } from "@/global-back-nav";
import { SiteBehavior } from "@/site-behavior";
import { websiteUrl } from "@/urls";
import "./globals.css";
import "./public-routes.css";
import "./site-v1.css";
import "./design-pass.css";
import "./spacing-audit.css";
import "./editorial-signal.css";
import "./homepage-reset.css";
import "./editorial-interface.css";
import "./bible-glass.css";
import "./moody-light.css";
import "./brand-guide-pass.css";
import "./final-polish.css";
import "./cleanup-pass.css";
import "./sitewide-rhythm.css";
import "./navigation-seo.css";
import "./app-conversion.css";
import "./app-conversion-fix.css";
import "./study-guidance.css";
import "./reading-rhythm-final.css";
import "./how-page-contrast.css";
import "./final-ui-polish.css";
import "./contrast-rhythm-final.css";
import "./home-result-contrast.css";

export const metadata: Metadata = {
  metadataBase: new URL(websiteUrl),
  title: { default: "Apostolic Guide | Scripture, Doctrine, and Biblical Answers", template: "%s | Apostolic Guide" },
  description: "Search Scripture, study Apostolic doctrine, follow connected Bible passages, and find clear biblical answers about God, Jesus Christ, salvation, and the apostolic faith.",
  applicationName: "Apostolic Guide",
  authors: [{ name: "Apostolic Guide", url: websiteUrl }],
  creator: "Apostolic Guide",
  publisher: "Apostolic Guide",
  category: "Bible study and Christian doctrine",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1
    }
  },
  openGraph: {
    title: "Apostolic Guide | Know What You Believe and Why",
    description: "Search Scripture, follow connected passages, and understand Apostolic doctrine from the biblical text.",
    type: "website",
    siteName: "Apostolic Guide",
    url: websiteUrl,
    locale: "en_US",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Apostolic Guide — Scripture, doctrine, and biblical answers" }]
  },
  twitter: {
    card: "summary_large_image",
    title: "Apostolic Guide | Know What You Believe and Why",
    description: "Search Scripture, follow connected passages, and understand Apostolic doctrine from the biblical text.",
    images: ["/opengraph-image"]
  },
  icons: { icon: "/favicon.png", apple: "/icons/icon-192.png" },
  alternates: { types: { "application/rss+xml": "/feed.xml" } }
};

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Apostolic Guide",
  url: websiteUrl,
  logo: `${websiteUrl}/icons/icon-512.png`,
  description: "A Scripture-first study platform for Apostolic doctrine, connected Bible passages, and biblical answers."
};

const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Apostolic Guide",
  alternateName: "AG",
  url: websiteUrl,
  description: "Search Scripture, study Apostolic doctrine, and follow connected biblical passages.",
  publisher: { "@type": "Organization", name: "Apostolic Guide" },
  potentialAction: {
    "@type": "SearchAction",
    target: `${websiteUrl}/search?q={search_term_string}`,
    "query-input": "required name=search_term_string"
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }} />
        <a className="skip-link" href="#main-content">Skip to content</a>
        <SiteHeader />
        <GlobalBackNav />
        <main id="main-content">{children}</main>
        <SiteFooter />
        <SiteBehavior />
        <Suspense fallback={null}><ProductAnalytics /></Suspense>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
