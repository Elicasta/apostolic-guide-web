import type { Metadata } from "next";
import TeleprompterDisplay from "@/components/teleprompter/TeleprompterDisplay";

export const metadata: Metadata = {
  title: "Teleprompter | Apostolic Guide",
  robots: { index: false, follow: false },
};

export default function TeleprompterPage() {
  return <TeleprompterDisplay />;
}
