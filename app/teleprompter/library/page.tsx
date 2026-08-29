import type { Metadata } from "next";
import TeleprompterLibrary from "@/components/teleprompter/TeleprompterLibrary";

export const metadata: Metadata = {
  title: "Teleprompter Library | Apostolic Guide",
  robots: { index: false, follow: false },
};

export default function TeleprompterLibraryPage() {
  return <TeleprompterLibrary />;
}
