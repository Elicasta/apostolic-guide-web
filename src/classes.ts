export type ClassLesson = {
  slug: string;
  title: string;
  series: string;
  summary: string;
  description: string;
  teacher: string;
  publishedAt: string;
  durationMinutes: number;
  scriptureReferences: string[];
  tags: string[];
  youtubeId?: string;
  status: "live" | "published" | "draft";
};

export const classLessons: ClassLesson[] = [
  {
    slug: "the-one-god-revealed-in-jesus-christ",
    title: "The One God Revealed in Jesus Christ",
    series: "Foundations of Apostolic Doctrine",
    summary: "A Scripture-first class tracing the oneness of God, the incarnation, and the full revelation of God in Jesus Christ.",
    description: "This mock class demonstrates the future Apostolic Guide teaching library. Each class will pair a replay with key Scriptures, class notes, connected pathways, and next-study recommendations.",
    teacher: "Eli Castaneda",
    publishedAt: "2026-08-06",
    durationMinutes: 58,
    scriptureReferences: ["Deuteronomy 6:4", "John 1:1–14", "John 14:9–11", "Colossians 2:9"],
    tags: ["Oneness", "Jesus Christ", "Incarnation"],
    status: "published"
  }
];
