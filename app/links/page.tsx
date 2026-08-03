import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, BookOpen, FileText, Instagram, Music2, Play, Search } from "lucide-react";
import { Brand } from "@/components";
import { buildAppUrl } from "@/urls";

export const metadata: Metadata = {
  title: "Links",
  description: "Open the Apostolic Guide app, latest studies, articles, media, and social channels."
};

export default function LinksPage() {
  const configuredLinks = [
    { label: "Watch on YouTube", href: process.env.NEXT_PUBLIC_YOUTUBE_URL, icon: Play },
    { label: "Follow on Instagram", href: process.env.NEXT_PUBLIC_INSTAGRAM_URL, icon: Instagram },
    { label: "Listen to Apostolic Guide music", href: process.env.NEXT_PUBLIC_MUSIC_URL, icon: Music2 }
  ].filter((item): item is { label: string; href: string; icon: typeof Play } => Boolean(item.href));

  return (
    <section className="link-hub">
      <div className="link-hub-inner">
        <Brand />
        <h1>Scripture. Doctrine. Answers.</h1>
        <p>Read the latest study, search a question, or open the full Scripture app.</p>
        <div className="link-stack">
          <a href={buildAppUrl("/", { origin: "links", placement: "primary-link" })}><Search size={19} /><span>Open the Apostolic Guide app</span><ArrowUpRight size={17} /></a>
          <Link href="/articles"><FileText size={19} /><span>Read the latest articles</span><ArrowUpRight size={17} /></Link>
          <Link href="/topics"><BookOpen size={19} /><span>Explore the doctrine library</span><ArrowUpRight size={17} /></Link>
          {configuredLinks.map(({ label, href, icon: Icon }) => <a key={label} href={href} target="_blank" rel="noreferrer"><Icon size={19} /><span>{label}</span><ArrowUpRight size={17} /></a>)}
        </div>
        <small>APOSTOLICGUIDE.COM</small>
      </div>
    </section>
  );
}
