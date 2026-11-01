import type { Metadata } from "next";
import "./ekegusii.css";

// Keep the Ekegusii edition separate from the main site's social preview.
// Both this landing page and nested teaching URLs inherit the scoped image.
const socialImage = "/ekegusii/opengraph-image";
const twitterImage = "/ekegusii/twitter-image";
const shareTitle = "Ekegusii Bible Studies | Apostolic Guide";
const shareDescription =
  "Explore 20 Ekegusii Bible teaching Pathways and 106 Scripture steps. Read with the 2021 Ekegusii Bible and suggest corrections to the draft translations.";

export const metadata: Metadata = {
  title: "Ekegusii Bible Study | Apostolic Guide Review Edition",
  description: shareDescription,
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
  openGraph: {
    type: "website",
    siteName: "Apostolic Guide",
    title: shareTitle,
    description: shareDescription,
    images: [{
      url: socialImage,
      width: 1200,
      height: 630,
      alt: "Ekegusii Bible Studies: Amang’ana a Nyasae — 20 Pathways and 106 Scripture steps",
    }],
  },
  twitter: {
    card: "summary_large_image",
    title: shareTitle,
    description: shareDescription,
    images: [twitterImage],
  },
};

export default function EkegusiiLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
