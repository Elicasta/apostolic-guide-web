import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { allPathways, pathwayBySlug } from "@/pathway-catalog";
import { bibleSourcedEkegusiiSeed } from "@/ekegusii-language-audit";
import { EkegusiiReader } from "@/ekegusii-edition";
import { getPublishedEkegusiiSeed } from "@/ekegusii-review-data";

type Props = { params: Promise<{ slug: string }> };
export function generateStaticParams() {
  return allPathways.map((pathway) => ({ slug: pathway.slug }));
}
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const pathway = pathwayBySlug(slug);
  return {
    title: pathway ? pathway.title + " | Ekegusii Bible Study | Apostolic Guide" : "Pathway Not Found",
    description: pathway?.summary,
    robots: { index: false, follow: false },
  };
}
export const dynamic = "force-dynamic";
export default async function EkegusiiPathway({ params }: Props) {
  const { slug } = await params;
  const pathway = pathwayBySlug(slug);
  if (!pathway) notFound();
  const index = allPathways.findIndex((item) => item.slug === slug);
  const next = allPathways[index + 1];
  const seed = await getPublishedEkegusiiSeed(slug);
  return <EkegusiiReader pathway={pathway} index={index} total={allPathways.length}
    seed={seed}
    nextPathway={next ? { slug: next.slug, title: bibleSourcedEkegusiiSeed(next.slug).title || next.title } : undefined}/>;
}
