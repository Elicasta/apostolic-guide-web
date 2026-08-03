import type { Metadata } from "next";
import { AppBridge, PageHero } from "@/components";
import { media } from "@/data";
import { MediaLibrary } from "@/media-library";

export const metadata: Metadata = {
  title: "Media",
  description: "Teaching videos, short explanations, music, and visual Scripture content from Apostolic Guide."
};

export default function MediaPage() {
  return (
    <>
      <PageHero variant="media" eyebrow="Watch and listen" title="Apostolic Guide media." text="Teaching, short explanations, music, and visual content built to move people back into the text." />
      <section className="section media-index-section"><div className="shell"><MediaLibrary items={media} /></div></section>
      <section className="section section-tight"><div className="shell"><AppBridge origin="media" /></div></section>
    </>
  );
}
