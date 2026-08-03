import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageHero, SearchForm, TopicCard } from "@/components";
import { topics } from "@/data";
import { listDatabaseContent } from "@/database-content";

export const metadata: Metadata = {
  title: "Topics",
  description: "Explore Apostolic Guide topics about the one God, Jesus Christ, salvation, and biblical interpretation."
};

export default async function TopicsPage() {
  const databaseTopics = await listDatabaseContent("topic");
  const localSlugs = new Set(topics.map((topic) => topic.slug));

  return (
    <>
      <PageHero eyebrow="Doctrine library" title="Begin with the biblical claim." text="Each topic gathers the key Scriptures, direct answers, long-form studies, and pathways needed to understand and explain the doctrine." />
      <section className="section">
        <div className="shell">
          <SearchForm compact />
          <div className="topic-grid directory-grid">
            {databaseTopics.filter((item) => !localSlugs.has(item.slug)).map((item) => (
              <Link className="topic-card" href={`/topics/${item.slug}`} key={item.id}>
                <span className="topic-card-accent" aria-hidden>STUDY</span><span className="eyebrow">Published topic</span><h3>{item.title}</h3><p>{item.summary}</p><span className="text-link">Explore topic <ArrowRight size={16} /></span>
              </Link>
            ))}
            {topics.map((topic) => <TopicCard key={topic.slug} topic={topic} />)}
          </div>
        </div>
      </section>
    </>
  );
}
