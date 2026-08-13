import type { Metadata } from "next";
import "./studio-brand.css";

export const metadata: Metadata = {
  title: "Broadcast Studio",
  description: "Apostolic Guide production studio for episodes, live sessions, guests, questions, polls, and broadcast output.",
  robots: { index: false, follow: false }
};

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return <div className="ag-studio-surface">{children}</div>;
}
