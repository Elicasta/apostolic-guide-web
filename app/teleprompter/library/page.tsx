import type { Metadata } from "next";
import Link from "next/link";
import TeleprompterLibrary from "@/components/teleprompter/TeleprompterLibrary";

export const metadata: Metadata = {
  title: "Teleprompter Library | Apostolic Guide",
  robots: { index: false, follow: false },
};

export default function TeleprompterLibraryPage() {
  return <><p><Link href="/admin/code-mode?tool=teleprompter">Open private Script Code Mode</Link></p><TeleprompterLibrary /></>;
}
