import {
  answerBySlug,
  answers,
  articleBySlug,
  articles,
  scriptureByPath,
  scriptures,
  topicBySlug,
  topics
} from "./data";
import { allPathways, pathwayBySlug } from "./pathway-catalog";
import type { SmartSuggestionCandidate } from "./smart-next";

function dedupe(items: SmartSuggestionCandidate[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.href)) return false;
    seen.add(item.href);
    return true;
  });
}

function topicCandidate(slug: string, priority = 20): SmartSuggestionCandidate | null {
  const topic = topicBySlug(slug);
  return topic ? {
    href: `/topics/${topic.slug}`,
    title: topic.title,
    description: topic.summary,
    kind: "Doctrine topic",
    reason: "See the complete doctrine organized in one place.",
    priority
  } : null;
}

function pathwayCandidatesForTopic(topicSlug: string, priority = 30) {
  return allPathways
    .filter((pathway) => pathway.topicSlug === topicSlug)
    .map((pathway, index): SmartSuggestionCandidate => ({
      href: `/pathways/${pathway.slug}`,
      title: pathway.title,
      description: pathway.summary,
      kind: "Guided pathway",
      reason: "Follow the supporting passages in sequence.",
      priority: priority - index
    }));
}

function articleCandidatesForTopic(topicSlug: string, priority = 25) {
  return articles
    .filter((article) => article.topicSlug === topicSlug)
    .map((article, index): SmartSuggestionCandidate => ({
      href: `/articles/${article.slug}`,
      title: article.title,
      description: article.summary,
      kind: "Article",
      reason: "Go deeper into the argument and its connected passages.",
      priority: priority - index
    }));
}

function answerCandidatesForTopic(topicSlug: string, priority = 18) {
  return answers
    .filter((answer) => answer.topicSlug === topicSlug)
    .map((answer, index): SmartSuggestionCandidate => ({
      href: `/answers/${answer.slug}`,
      title: answer.question,
      description: answer.shortAnswer,
      kind: "Direct answer",
      reason: "Work through the next question this doctrine commonly raises.",
      priority: priority - index
    }));
}

export function articleSuggestions(slug: string) {
  const currentIndex = articles.findIndex((article) => article.slug === slug);
  const orderedArticles = currentIndex >= 0
    ? [...articles.slice(currentIndex + 1), ...articles.slice(0, currentIndex)]
    : articles;
  const current = articleBySlug(slug);

  const articleSequence = orderedArticles.map((article, index): SmartSuggestionCandidate => ({
    href: `/articles/${article.slug}`,
    title: article.title,
    description: article.summary,
    kind: "Next article",
    reason: "Continue through the Apostolic Guide study series.",
    actionLabel: "Read next article",
    priority: 120 - index
  }));

  const related = current ? [
    ...pathwayCandidatesForTopic(current.topicSlug, 45),
    topicCandidate(current.topicSlug, 38),
    ...answerCandidatesForTopic(current.topicSlug, 30)
  ].filter((item): item is SmartSuggestionCandidate => Boolean(item)) : [
    ...allPathways.slice(0, 3).map((pathway, index): SmartSuggestionCandidate => ({
      href: `/pathways/${pathway.slug}`,
      title: pathway.title,
      description: pathway.summary,
      kind: "Guided pathway",
      priority: 25 - index
    }))
  ];

  return dedupe([...articleSequence, ...related]);
}

export function answerSuggestions(slug: string) {
  const answer = answerBySlug(slug);
  if (!answer) return dedupe([
    ...articles.slice(0, 3).map((article, index): SmartSuggestionCandidate => ({
      href: `/articles/${article.slug}`,
      title: article.title,
      description: article.summary,
      kind: "Article",
      priority: 30 - index
    })),
    ...allPathways.slice(0, 3).map((pathway, index): SmartSuggestionCandidate => ({
      href: `/pathways/${pathway.slug}`,
      title: pathway.title,
      description: pathway.summary,
      kind: "Guided pathway",
      priority: 24 - index
    }))
  ]);

  return dedupe([
    ...pathwayCandidatesForTopic(answer.topicSlug, 55),
    ...articleCandidatesForTopic(answer.topicSlug, 46),
    topicCandidate(answer.topicSlug, 40),
    ...answerCandidatesForTopic(answer.topicSlug, 28)
  ].filter((item): item is SmartSuggestionCandidate => Boolean(item)));
}

export function topicSuggestions(slug: string) {
  const topic = topicBySlug(slug);
  if (!topic) return [];
  const relatedTopics = topics
    .filter((item) => item.slug !== slug && item.category === topic.category)
    .map((item, index): SmartSuggestionCandidate => ({
      href: `/topics/${item.slug}`,
      title: item.title,
      description: item.summary,
      kind: "Related doctrine",
      reason: "Build the next connected layer of the biblical case.",
      priority: 24 - index
    }));

  return dedupe([
    ...pathwayCandidatesForTopic(slug, 60),
    ...articleCandidatesForTopic(slug, 48),
    ...answerCandidatesForTopic(slug, 38),
    ...relatedTopics
  ]);
}

export function pathwaySuggestions(slug: string) {
  const pathway = pathwayBySlug(slug);
  if (!pathway) return [];
  const collection = allPathways.filter((item) => item.collection === pathway.collection);
  const currentIndex = collection.findIndex((item) => item.slug === slug);
  const ordered = currentIndex >= 0
    ? [...collection.slice(currentIndex + 1), ...collection.slice(0, currentIndex)]
    : collection;

  const collectionCandidates = ordered.map((item, index): SmartSuggestionCandidate => ({
    href: `/pathways/${item.slug}`,
    title: item.title,
    description: item.summary,
    kind: "Next pathway",
    reason: "Continue through this pathway collection.",
    priority: 70 - index
  }));

  return dedupe([
    ...collectionCandidates,
    ...articleCandidatesForTopic(pathway.topicSlug, 45),
    topicCandidate(pathway.topicSlug, 40),
    ...answerCandidatesForTopic(pathway.topicSlug, 32)
  ].filter((item): item is SmartSuggestionCandidate => Boolean(item)));
}

export function scriptureSuggestions(path: string) {
  const entry = scriptureByPath(path);
  if (!entry) return [];

  const connected = entry.related.flatMap((reference, index) => {
    const scripture = scriptures.find((item) => item.reference === reference);
    return scripture ? [{
      href: `/scripture/${scripture.path}`,
      title: scripture.reference,
      description: scripture.mainPoint,
      kind: "Connected passage",
      reason: "Follow the passage connection in context.",
      priority: 62 - index
    } satisfies SmartSuggestionCandidate] : [];
  });

  const topicCandidates = entry.topicSlugs.flatMap((topicSlug, index) => [
    ...pathwayCandidatesForTopic(topicSlug, 52 - index),
    topicCandidate(topicSlug, 45 - index),
    ...articleCandidatesForTopic(topicSlug, 38 - index),
    ...answerCandidatesForTopic(topicSlug, 30 - index)
  ].filter((item): item is SmartSuggestionCandidate => Boolean(item)));

  return dedupe([...connected, ...topicCandidates]);
}
