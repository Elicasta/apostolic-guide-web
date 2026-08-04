import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { answers, topicBySlug } from "@/data";
import { PageHero, SearchForm } from "@/components";
import { listDatabaseContent } from "@/database-content";

export const metadata = { title: "Answers", description: "Direct answers to common questions about God, Jesus Christ, salvation, and apostolic doctrine." };

export default async function AnswersPage() {
  const databaseAnswers = await listDatabaseContent("answer");
  const localSlugs = new Set(answers.map((answer) => answer.slug));
  return (
    <>
      <PageHero variant="answers" eyebrow="Questions welcomed" title="Direct biblical answers" text="Start with the objection, confusion, or passage in front of you. Read the direct answer first, then examine the evidence." />
      <section className="section answers-index-section">
        <div className="shell">
          <SearchForm compact />
          <div className="list-stack answers-list">
            {databaseAnswers.filter((item) => !localSlugs.has(item.slug)).map((item) => (
              <Link className="list-row" href={`/answers/${item.slug}`} key={item.id} data-reveal>
                <span className="kind">Published answer</span><div><h3>{item.title}</h3><p>{item.summary}</p></div><ArrowRight />
              </Link>
            ))}
            {answers.map((answer) => (
              <Link className="list-row" href={`/answers/${answer.slug}`} key={answer.slug} data-reveal>
                <span className="kind">{topicBySlug(answer.topicSlug)?.title}</span>
                <div><h3>{answer.question}</h3><p>{answer.shortAnswer}</p></div>
                <ArrowRight />
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
