import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Suspense } from "react";
import { SiteFooter, SiteHeader } from "@/components";
import { FooterConnect } from "@/footer-connect";
import { ProductAnalytics } from "@/analytics";
import { EmailCapture } from "@/email-capture";
import { GlobalBackNav } from "@/global-back-nav";
import { ReadingProgress } from "@/reading-progress";
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
import "./spacing-system-v2.css";
import "./card-system-v2.css";
import "./app-screenshot-v1.css";
import "./motion-system-v1.css";
import "./content-links-polish.css";
import "./pathway-directory.css";
import "./article-conclusion.css";
import "./retention-system.css";
import "./smart-navigation.css";
import "./connectivity-polish.css";
import "./editorial-divider-system.css";
import "./line-polish-final.css";
import "./scripture-library-browser.css";
import "./about-page-v2.css";
import "./footer-connect.css";
import "./bible-links.css";
import "./contact-form.css";

const socialShareImage = "/opengraph-image?v=20260812";

export const metadata: Metadata = {
  metadataBase: new URL(websiteUrl),
  title: { default: "Apostolic Guide | Scripture, Doctrine, and Biblical Answers", template: "%s | Apostolic Guide" },
  description: "Search Scripture, study Apostolic doctrine, follow connected Bible passages, and find clear biblical answers about God, Jesus Christ, salvation, and the apostolic faith.",
  applicationName: "Apostolic Guide",
  authors: [{ name: "Apostolic Guide", url: websiteUrl }],
  creator: "Apostolic Guide",
  publisher: "Apostolic Guide",
  category: "Bible study and Christian doctrine",
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } },
  openGraph: { title: "Apostolic Guide | Know What You Believe. Know Why.", description: "Search Scripture, follow connected passages, and understand Apostolic doctrine from the text itself.", type: "website", siteName: "Apostolic Guide", url: websiteUrl, locale: "en_US", images: [{ url: socialShareImage, width: 1200, height: 630, alt: "Apostolic Guide. Know what you believe. Know why." }] },
  twitter: { card: "summary_large_image", title: "Apostolic Guide | Know What You Believe. Know Why.", description: "Search Scripture, follow connected passages, and understand Apostolic doctrine from the text itself.", images: [socialShareImage] },
  icons: { icon: "/favicon.png", apple: "/icons/icon-192.png" },
  alternates: { types: { "application/rss+xml": "/feed.xml" } }
};

const organizationJsonLd = { "@context": "https://schema.org", "@type": "Organization", name: "Apostolic Guide", url: websiteUrl, logo: `${websiteUrl}/icons/icon-512.png`, description: "A Scripture-first study platform for Apostolic doctrine, connected Bible passages, and biblical answers." };
const websiteJsonLd = { "@context": "https://schema.org", "@type": "WebSite", name: "Apostolic Guide", alternateName: "AG", url: websiteUrl, description: "Search Scripture, study Apostolic doctrine, and follow connected biblical passages.", publisher: { "@type": "Organization", name: "Apostolic Guide" }, potentialAction: { "@type": "SearchAction", target: `${websiteUrl}/search?q={search_term_string}`, "query-input": "required name=search_term_string" } };
const surfaceScript = `try{var h=location.hostname.toLowerCase();if(h==='studio.apostolicguide.com'||h.startsWith('studio.'))document.documentElement.classList.add('ag-studio-host');if(h==='live.apostolicguide.com'||h.startsWith('live.'))document.documentElement.classList.add('ag-live-host')}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <script dangerouslySetInnerHTML={{ __html: surfaceScript }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }} />
        <a className="skip-link" href="#main-content">Skip to content</a>
        <SiteHeader />
        <GlobalBackNav />
        <main id="main-content">{children}</main>
        <FooterConnect />
        <SiteFooter />
        <SiteBehavior />
        <Suspense fallback={null}>
          <ReadingProgress />
          <EmailCapture />
          <ProductAnalytics />
        </Suspense>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}