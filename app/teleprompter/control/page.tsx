import type { Metadata } from "next";
import TeleprompterController from "@/components/teleprompter/TeleprompterController";

export const metadata: Metadata = {
  title: "Teleprompter Remote | Apostolic Guide",
  robots: { index: false, follow: false },
};

export default function TeleprompterControlPage() {
  return <TeleprompterController />;
}
