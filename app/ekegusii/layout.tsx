import type { Metadata } from "next";
import "./ekegusii.css";

export const metadata: Metadata = {
  title: "Ekegusii Bible Study | Apostolic Guide Review Edition",
  description: "Twenty guided Apostolic Bible studies prepared for translation and native-speaker editorial review in Ekegusii.",
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

export default function EkegusiiLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
