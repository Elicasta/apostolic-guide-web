import type { Metadata } from "next";
import { AppInstallGuide } from "@/app-install-guide";

export const metadata: Metadata = {
  title: "Install the Apostolic Guide App",
  description: "Add Apostolic Guide to your home screen, then continue into the Scripture study app.",
  alternates: { canonical: "/app" },
  robots: { index: true, follow: true }
};

type Props = { searchParams: Promise<{ destination?: string }> };

export default async function AppPage({ searchParams }: Props) {
  const { destination = null } = await searchParams;
  return <AppInstallGuide destination={destination} />;
}
