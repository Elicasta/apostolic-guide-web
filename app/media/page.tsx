import type { Metadata } from "next";
import { ArrowUpRight, Headphones, Play, Radio } from "lucide-react";
import { PageHero } from "@/components";
import { media } from "@/data";

export const metadata: Metadata = { title: "Media", description: "Apostolic Guide music, short-form explanations, and teaching media." };
const icons = { Music: Headphones, Short: Play, Teaching: Radio } as const;

export default function MediaPage() {
  return <><PageHero eyebrow="Watch and listen" title="Media built around the message." text="Music, short explanations, and teaching that carry the same Scripture-first framework as the written library." /><section className="section"><div className="shell media-grid">{media.map((item) => { const Icon = icons[item.type]; const content = <><div className="media-art"><Icon size={38} /><span>{item.type}</span></div><div><span className="eyebrow">{item.duration}</span><h2>{item.title}</h2><p>{item.summary}</p><span className="text-link">{item.url ? "Open media" : "Coming soon"}{item.url && <ArrowUpRight size={16} />}</span></div></>; return item.url ? <a className="media-card" href={item.url} target="_blank" rel="noreferrer" key={item.slug}>{content}</a> : <article className="media-card media-card-placeholder" key={item.slug}>{content}</article>; })}</div></section></>;
}
