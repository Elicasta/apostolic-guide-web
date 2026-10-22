import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { allPathways, pathwayBySlug } from "@/pathway-catalog";
import { EkegusiiReader } from "@/ekegusii-edition";

type Props = { params: Promise<{ slug: string }> };
export function generateStaticParams() {
  return allPathways.map((pathway) => ({ slug: pathway.slug }));
}
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const pathway = pathwayBySlug(slug);
  return {
    title: pathway ? pathway.title + " | Ekegusii Review | Apostolic Guide" : "Pathway Not Found",
    description: pathway?.summary,
    robots: { index: false, follow: false },
  };
}
export default async function EkegusiiPathway({ params }: Props) {
  const { slug } = await params;
  const pathway = pathwayBySlug(slug);
  if (!pathway) notFound();
  return <EkegusiiReader pathway={pathway} index={allPathways.findIndex((item) => item.slug === slug)} total={allPathways.length}/>;
}
