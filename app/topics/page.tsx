import type { Metadata } from "next";
import { PageHero } from "@/components";
import { topics } from "@/data";
import { TopicDirectory } from "@/topic-directory";

export const metadata: Metadata = {
  title: "Topics",
  description: "Explore Apostolic Guide doctrine topics with central claims, key Scriptures, explanations, and related study pathways."
};

export default function TopicsPage() {
  return (
    <>
      <PageHero variant="topics" eyebrow="Doctrine library" title="Follow the whole biblical case." text="Start with a doctrine, see the central claim, open the key passages, and follow the related questions and pathways." />
      <section className="section topics-page-section">
        <div className="shell"><TopicDirectory topics={topics} /></div>
      </section>
    </>
  );
}
